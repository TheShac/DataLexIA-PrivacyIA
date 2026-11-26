import { createHash } from "node:crypto";
import { Router } from "express";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { authMiddleware, requirePermission } from "#src/middlewares/auth.middleware.js";
import { uploadFile } from "#src/middlewares/upload.middleware.js";
import { audit } from "#src/modules/auth/auth.service.js";
import { users } from "#src/modules/users/schema/users.schema.js";
import { documents } from "#src/modules/documents/schema/documents.schema.js";
import { analyses, findings } from "#src/modules/analyses/schema/analyses.schema.js";
import {
  captureConfig,
  enqueueAnalysis,
  enqueueMitigations,
  hasPendingMitigations,
  recomputePriority,
} from "#src/modules/analyses/analyses.service.js";
import { buildDpia } from "#src/modules/analyses/dpia.service.js";
import { findOriginal, saveOriginal } from "#src/modules/analyses/storage.service.js";

const router = Router();
router.use(authMiddleware);

const parseId = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);
const ordered = sql`${findings.priority} IS NULL`;

const createFields = z.object({ k: z.coerce.number().int().min(1).max(50).optional() });
const listQuery = z.object({
  status: z.enum(["pendiente", "en_proceso", "completado", "error"]).optional(),
  documentId: z.coerce.number().int().positive().optional(),
});

async function loadAnalysis(id: number) {
  const [row] = await db
    .select({ analysis: analyses, document: documents, requestedByName: users.fullName })
    .from(analyses)
    .innerJoin(documents, eq(documents.id, analyses.documentId))
    .innerJoin(users, eq(users.id, analyses.requestedBy))
    .where(eq(analyses.id, id))
    .limit(1);
  return row;
}
const loadFindings = (analysisId: number) =>
  db.select().from(findings).where(eq(findings.analysisId, analysisId)).orderBy(ordered, asc(findings.priority), asc(findings.id));

/* CU-06: solicitar análisis de cumplimiento (se ejecuta en segundo plano). */
router.post("/", requirePermission("analyses.run"), uploadFile, async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Falta el archivo (campo multipart "file")' });
    const f = createFields.safeParse(req.body);
    if (!f.success) return res.status(400).json({ error: f.error.flatten() });

    // El documento analizado queda en el catálogo; si ya existe (mismo hash) se reutiliza.
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    let [doc] = await db.select().from(documents).where(eq(documents.sha256, sha256)).orderBy(desc(documents.id)).limit(1);
    if (!doc) {
      const [ins] = await db.insert(documents).values({
        title: file.originalname.replace(/\.[^.]+$/, ""),
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256,
        category: "analisis",
        status: "cargado",
        uploadedBy: req.user!.id,
      });
      [doc] = await db.select().from(documents).where(eq(documents.id, ins.insertId));
    }

    // Se guarda el original para la vista previa; si falla, el análisis sigue igual.
    await saveOriginal(sha256, file.buffer).catch((err) => console.error("[analyses] no se pudo guardar el original:", err));

    const config = await captureConfig(f.data.k, file.originalname);
    const [ins] = await db.insert(analyses).values({ documentId: doc.id, requestedBy: req.user!.id, config });
    enqueueAnalysis(ins.insertId, file, f.data.k);

    await audit(req, { action: "analysis.request", entityType: "analysis", entityId: ins.insertId, details: { documentId: doc.id } });
    res.status(202).json({ analysisId: ins.insertId, documentId: doc.id, status: "pendiente", statusUrl: `/api/analyses/${ins.insertId}` });
  } catch (err) {
    next(err);
  }
});

/* CU-15: historial de análisis. */
router.get("/", requirePermission("analyses.read"), async (req, res, next) => {
  try {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.flatten() });
    const conds = [q.data.status && eq(analyses.status, q.data.status), q.data.documentId && eq(analyses.documentId, q.data.documentId)].filter(
      (c): c is SQL => typeof c === "object",
    );
    const rows = await db
      .select({
        id: analyses.id,
        status: analyses.status,
        overall: analyses.overall,
        countHigh: analyses.countHigh,
        countMedium: analyses.countMedium,
        countLow: analyses.countLow,
        createdAt: analyses.createdAt,
        finishedAt: analyses.finishedAt,
        documentId: documents.id,
        documentTitle: documents.title,
        requestedBy: users.fullName,
      })
      .from(analyses)
      .innerJoin(documents, eq(documents.id, analyses.documentId))
      .innerJoin(users, eq(users.id, analyses.requestedBy))
      .where(and(...conds))
      .orderBy(desc(analyses.id));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* Resultado: análisis + hallazgos ordenados por prioridad (CU-07, CU-08). */
router.get("/:id", requirePermission("analyses.read"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const row = await loadAnalysis(id);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    res.json({
      analysis: row.analysis,
      document: { id: row.document.id, title: row.document.title, filename: row.document.filename, version: row.document.version },
      requestedBy: row.requestedByName,
      mitigationsPending: hasPendingMitigations(id),
      findings: await loadFindings(id),
    });
  } catch (err) {
    next(err);
  }
});

/* Archivo original analizado, para la vista previa. */
router.get("/:id/file", requirePermission("analyses.read"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const row = await loadAnalysis(id);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    const file = await findOriginal(row.document.sha256);
    if (!file) {
      return res.status(404).json({ error: "El archivo original no está guardado. Vuelve a subirlo para ver la vista previa." });
    }
    await audit(req, { action: "analysis.file_view", entityType: "analysis", entityId: id });
    // Siempre como descarga y sin caché: es un archivo ajeno, el navegador no debe interpretarlo ni retenerlo.
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row.document.filename)}`);
    res.setHeader("cache-control", "private, no-store");
    res.sendFile(file, { cacheControl: false }, (err) => err && next(err));
  } catch (err) {
    next(err);
  }
});

/* CU-07: proponer medidas de mitigación (segundo plano). */
router.post("/:id/mitigations", requirePermission("analyses.run"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const row = await loadAnalysis(id);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    if (row.analysis.status !== "completado") return res.status(409).json({ error: `El análisis está ${row.analysis.status}` });
    if (hasPendingMitigations(id)) return res.status(409).json({ error: "Ya se están generando las medidas" });
    enqueueMitigations(id);
    await audit(req, { action: "analysis.mitigations", entityType: "analysis", entityId: id });
    res.status(202).json({ analysisId: id, message: "Generando medidas; consulta el análisis para ver el avance" });
  } catch (err) {
    next(err);
  }
});

/* CU-08: recalcular prioridades (p. ej. tras rechazar hallazgos en la revisión). */
router.post("/:id/prioritize", requirePermission("analyses.run"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    if (!(await loadAnalysis(id))) return res.status(404).json({ error: "Análisis no encontrado" });
    await recomputePriority(id);
    await audit(req, { action: "analysis.prioritize", entityType: "analysis", entityId: id });
    res.json(await loadFindings(id));
  } catch (err) {
    next(err);
  }
});

/* CU-09: borrador de DPIA. ?format=md devuelve Markdown. */
router.get("/:id/dpia", requirePermission("analyses.read"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const row = await loadAnalysis(id);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    if (row.analysis.status !== "completado") return res.status(409).json({ error: `El análisis está ${row.analysis.status}` });

    const dpia = buildDpia({
      analysis: row.analysis,
      document: { title: row.document.title, filename: row.document.filename, version: row.document.version },
      requestedBy: row.requestedByName,
      findings: await loadFindings(id),
    });
    await audit(req, { action: "analysis.dpia", entityType: "analysis", entityId: id });
    if (req.query.format === "md") return res.type("text/markdown; charset=utf-8").send(dpia.markdown);
    res.json(dpia);
  } catch (err) {
    next(err);
  }
});

export default router;
