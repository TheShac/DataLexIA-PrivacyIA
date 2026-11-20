import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { validate } from "#src/middlewares/validate.middleware.js";
import { authMiddleware, requirePermission } from "#src/middlewares/auth.middleware.js";
import { audit } from "#src/modules/auth/auth.service.js";
import { users } from "#src/modules/users/schema/users.schema.js";
import { analyses, findings, findingReviews } from "#src/modules/analyses/schema/analyses.schema.js";
import { recomputePriority } from "#src/modules/analyses/analyses.service.js";

const router = Router();
router.use(authMiddleware);

const DECISIONS = ["aprobado", "modificado", "rechazado", "segunda_revision"] as const;

const reviewSchema = z
  .object({
    decision: z.enum(DECISIONS),
    comment: z.string().trim().max(2000).optional(),
    // Solo lo que el revisor puede corregir de un hallazgo de la IA.
    changes: z
      .object({
        severity: z.enum(["alto", "medio", "leve"]),
        explanation: z.string().trim().min(1).max(5000),
        mitigation: z.string().trim().min(1).max(5000),
      })
      .partial()
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "modificado" && !Object.keys(v.changes ?? {}).length) {
      ctx.addIssue({ code: "custom", path: ["changes"], message: "Indica qué cambias (gravedad, explicación o mitigación)" });
    }
    if ((v.decision === "rechazado" || v.decision === "segunda_revision") && !v.comment) {
      ctx.addIssue({ code: "custom", path: ["comment"], message: "El comentario es obligatorio para esta decisión" });
    }
  });

const parseId = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);

/* CU-12: revisar y validar un hallazgo. Cada decisión queda registrada; una nueva decisión reemplaza el estado vigente. */
router.post("/:id/review", requirePermission("findings.review"), validate(reviewSchema), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const body = req.body as z.infer<typeof reviewSchema>;

    const [row] = await db
      .select({ finding: findings, analysisStatus: analyses.status })
      .from(findings)
      .innerJoin(analyses, eq(analyses.id, findings.analysisId))
      .where(eq(findings.id, id))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Hallazgo no encontrado" });
    if (row.analysisStatus !== "completado") return res.status(409).json({ error: "El análisis aún no está completado" });
    const f = row.finding;

    // Solo cuenta como cambio lo que realmente difiere del valor actual.
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (body.decision === "modificado") {
      for (const [k, to] of Object.entries(body.changes ?? {})) {
        const from = f[k as "severity" | "explanation" | "mitigation"] ?? null;
        if (to !== from) diff[k] = { from, to };
      }
      if (!Object.keys(diff).length) return res.status(400).json({ error: "Los cambios no difieren del hallazgo actual" });
    }

    await db.transaction(async (tx) => {
      const values = Object.fromEntries(Object.entries(diff).map(([k, d]) => [k, d.to]));
      await tx.update(findings).set({ ...values, status: body.decision }).where(eq(findings.id, id));
      await tx.insert(findingReviews).values({
        findingId: id,
        reviewerId: req.user!.id,
        decision: body.decision,
        comment: body.comment || null,
        changes: Object.keys(diff).length ? diff : null,
      });
    });
    await recomputePriority(f.analysisId);
    await audit(req, { action: "finding.review", entityType: "finding", entityId: id, details: { decision: body.decision, changed: Object.keys(diff) } });

    const [updated] = await db.select().from(findings).where(eq(findings.id, id));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* Historial de decisiones de un hallazgo (trazabilidad). */
router.get("/:id/reviews", requirePermission("analyses.read"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    res.json(
      await db
        .select({
          id: findingReviews.id,
          decision: findingReviews.decision,
          comment: findingReviews.comment,
          changes: findingReviews.changes,
          createdAt: findingReviews.createdAt,
          reviewer: users.fullName,
        })
        .from(findingReviews)
        .innerJoin(users, eq(users.id, findingReviews.reviewerId))
        .where(eq(findingReviews.findingId, id))
        .orderBy(desc(findingReviews.id)),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
