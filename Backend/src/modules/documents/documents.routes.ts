import { createHash } from "node:crypto";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { and, desc, eq, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { uploadFile } from "#src/middlewares/upload.middleware.js";
import { validate } from "#src/middlewares/validate.middleware.js";
import { authMiddleware, requirePermission } from "#src/middlewares/auth.middleware.js";
import { audit } from "#src/modules/auth/auth.service.js";
import { documents } from "#src/modules/documents/schema/documents.schema.js";
import { archiveDocument, ragUpload, type DocumentRow } from "#src/modules/documents/documents.service.js";

const router = Router();
router.use(authMiddleware);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD");
const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const uploadFields = z
  .object({
    title: z.preprocess(emptyToUndef, z.string().trim().min(1).max(200).optional()),
    category: z.preprocess(emptyToUndef, z.string().trim().toLowerCase().max(60).optional()),
    validFrom: z.preprocess(emptyToUndef, dateStr.optional()),
    validUntil: z.preprocess(emptyToUndef, dateStr.optional()),
  })
  .refine((v) => !v.validFrom || !v.validUntil || v.validUntil >= v.validFrom, "validUntil debe ser posterior a validFrom");

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    validFrom: dateStr.nullable(),
    validUntil: dateStr.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que actualizar");

const listQuery = z.object({
  status: z.enum(["cargado", "procesando", "indexado", "error", "archivado"]).optional(),
  enabled: z.enum(["true", "false"]).optional(),
  category: z.string().max(60).optional(),
});

const parseId = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);
const today = () => new Date().toISOString().slice(0, 10);
const getDoc = async (id: number) => (await db.select().from(documents).where(eq(documents.id, id)).limit(1))[0];

/* ---------------------------------------------------------------- CU-03 */

// Cargar documento: guarda metadatos en MySQL e indexa en FastAPI.
router.post("/", requirePermission("documents.upload"), uploadFile, async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Falta el archivo (campo multipart "file")' });

    const parsed = uploadFields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const f = parsed.data;
    const category = f.category ?? null;

    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const live = ne(documents.status, "archivado");

    const [dup] = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(and(eq(documents.sha256, sha256), inArray(documents.status, ["procesando", "indexado"])))
      .limit(1);
    if (dup) return res.status(409).json({ error: "Este archivo ya fue cargado", documentId: dup.id });

    // Mismo nombre de archivo y tipo (ley / documento) => nueva versión del anterior.
    const sameKind = category === "ley" ? eq(documents.category, "ley") : or(isNull(documents.category), ne(documents.category, "ley"));
    const [previous] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.filename, file.originalname), eq(documents.status, "indexado"), live, sameKind))
      .orderBy(desc(documents.version))
      .limit(1);

    const [ins] = await db.insert(documents).values({
      title: f.title ?? file.originalname.replace(/\.[^.]+$/, ""),
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sha256,
      category,
      version: previous ? previous.version + 1 : 1,
      previousVersionId: previous?.id ?? null,
      status: "procesando",
      validFrom: f.validFrom ?? null,
      validUntil: f.validUntil ?? null,
      uploadedBy: req.user!.id,
    });
    const id = ins.insertId;

    let rag;
    try {
      rag = await ragUpload(category, file);
    } catch (err) {
      await db.update(documents).set({ status: "error" }).where(eq(documents.id, id));
      throw err; // 502 / 504
    }

    if (!rag.ok) {
      // 4xx de FastAPI (p. ej. formato no soportado): no se conserva el registro. 5xx: queda en "error".
      if (rag.status >= 400 && rag.status < 500) await db.delete(documents).where(eq(documents.id, id));
      else await db.update(documents).set({ status: "error" }).where(eq(documents.id, id));
      await audit(req, { action: "document.upload_failed", entityType: "document", entityId: id, details: { filename: file.originalname, ragStatus: rag.status } });
      return res.status(rag.status >= 500 ? 502 : rag.status).json({ error: "FastAPI rechazó el documento", detail: rag.body });
    }

    await db.update(documents).set({ status: "indexado", ragDocumentId: rag.body.id }).where(eq(documents.id, id));

    let warning: string | undefined;
    if (previous) {
      const archived = await archiveDocument(previous);
      if (!archived.ok) warning = `La versión ${previous.version} no se pudo retirar del índice RAG`;
    }

    await audit(req, {
      action: "document.upload",
      entityType: "document",
      entityId: id,
      details: { filename: file.originalname, version: previous ? previous.version + 1 : 1, chunks: rag.body.chunks },
    });
    res.status(201).json({ document: await getDoc(id), rag: { chunks: rag.body.chunks, anonymized: rag.body.anonymized, articles: rag.body.articles }, warning });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------- CU-04 */

router.get("/", requirePermission("documents.read"), async (req, res, next) => {
  try {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.flatten() });
    const { status, enabled, category } = q.data;
    const conds = [
      status && eq(documents.status, status),
      enabled && eq(documents.isEnabledSource, enabled === "true"),
      category && eq(documents.category, category.toLowerCase()),
    ].filter((c): c is SQL => typeof c === "object");
    res.json(await db.select().from(documents).where(and(...conds)).orderBy(desc(documents.createdAt)));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requirePermission("documents.read"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const doc = await getDoc(id);
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// Editar metadatos (título y vigencia).
router.patch("/:id", requirePermission("documents.manage"), validate(patchSchema), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const doc = await getDoc(id);
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

    const body = req.body as z.infer<typeof patchSchema>;
    const from = body.validFrom !== undefined ? body.validFrom : doc.validFrom;
    const until = body.validUntil !== undefined ? body.validUntil : doc.validUntil;
    if (from && until && until < from) return res.status(400).json({ error: "validUntil debe ser posterior a validFrom" });

    await db.update(documents).set(body).where(eq(documents.id, id));
    await audit(req, { action: "document.update", entityType: "document", entityId: id, details: body });
    res.json(await getDoc(id));
  } catch (err) {
    next(err);
  }
});

// Autorizar / desautorizar un documento como fuente (RF-04).
const setEnabled = (enabled: boolean) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const doc = await getDoc(id);
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

    if (enabled) {
      if (doc.status !== "indexado") return res.status(409).json({ error: `Solo se autorizan documentos indexados (estado actual: ${doc.status})` });
      if (doc.validUntil && doc.validUntil < today()) return res.status(409).json({ error: "El documento está vencido" });
      if (doc.validFrom && doc.validFrom > today()) return res.status(409).json({ error: "El documento aún no está vigente" });
    }
    await db.update(documents).set({ isEnabledSource: enabled }).where(eq(documents.id, id));
    await audit(req, { action: enabled ? "document.enable" : "document.disable", entityType: "document", entityId: id });
    res.json(await getDoc(id));
  } catch (err) {
    next(err);
  }
};
router.post("/:id/enable", requirePermission("documents.manage"), setEnabled(true));
router.post("/:id/disable", requirePermission("documents.manage"), setEnabled(false));

// Archivar: lo saca del índice RAG y lo marca como archivado (el registro se conserva por auditoría).
router.delete("/:id", requirePermission("documents.manage"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const doc = await getDoc(id);
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });
    if (doc.status === "archivado") return res.status(409).json({ error: "El documento ya está archivado" });

    const r = await archiveDocument(doc as DocumentRow);
    if (!r.ok) return res.status(502).json({ error: "No se pudo retirar el documento del índice de FastAPI", detail: r.detail });
    await audit(req, { action: "document.archive", entityType: "document", entityId: id });
    res.json(await getDoc(id));
  } catch (err) {
    next(err);
  }
});

export default router;
