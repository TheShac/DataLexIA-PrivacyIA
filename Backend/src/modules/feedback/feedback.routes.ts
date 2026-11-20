import { Router } from "express";
import { and, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { validate } from "#src/middlewares/validate.middleware.js";
import { authMiddleware, requirePermission } from "#src/middlewares/auth.middleware.js";
import { audit } from "#src/modules/auth/auth.service.js";
import { findings } from "#src/modules/analyses/schema/analyses.schema.js";
import { chatConversations, chatMessages } from "#src/modules/chat/schema/chat.schema.js";
import { aiFeedback } from "#src/modules/feedback/schema/feedback.schema.js";

const router = Router();
router.use(authMiddleware, requirePermission("feedback.create"));

// CU-13: se califica un hallazgo O una respuesta del chat, con puntaje 1-5, corrección y/o comentario.
const feedbackSchema = z
  .object({
    findingId: z.number().int().positive().optional(),
    messageId: z.number().int().positive().optional(),
    rating: z.number().int().min(1).max(5).optional(),
    correction: z.string().trim().max(5000).optional(),
    comment: z.string().trim().max(2000).optional(),
  })
  .refine((v) => (v.findingId === undefined) !== (v.messageId === undefined), "Indica findingId o messageId (solo uno)")
  .refine((v) => v.rating !== undefined || v.correction || v.comment, "Indica un puntaje, una corrección o un comentario");

const targetQuery = z
  .object({ findingId: z.coerce.number().int().positive().optional(), messageId: z.coerce.number().int().positive().optional() })
  .refine((v) => (v.findingId === undefined) !== (v.messageId === undefined), "Indica findingId o messageId (solo uno)");

const targetWhere = (userId: number, t: { findingId?: number; messageId?: number }): SQL =>
  and(eq(aiFeedback.userId, userId), t.findingId !== undefined ? eq(aiFeedback.findingId, t.findingId) : eq(aiFeedback.messageId, t.messageId!))!;

/** Califica (o actualiza la calificación propia de) un hallazgo o una respuesta. */
router.post("/", validate(feedbackSchema), async (req, res, next) => {
  try {
    const b = req.body as z.infer<typeof feedbackSchema>;
    const userId = req.user!.id;

    if (b.findingId !== undefined) {
      const [f] = await db.select({ id: findings.id }).from(findings).where(eq(findings.id, b.findingId)).limit(1);
      if (!f) return res.status(404).json({ error: "Hallazgo no encontrado" });
    } else {
      // Solo respuestas del asistente en conversaciones propias.
      const [m] = await db
        .select({ sender: chatMessages.sender })
        .from(chatMessages)
        .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
        .where(and(eq(chatMessages.id, b.messageId!), eq(chatConversations.userId, userId)))
        .limit(1);
      if (!m) return res.status(404).json({ error: "Mensaje no encontrado" });
      if (m.sender !== "asistente") return res.status(400).json({ error: "Solo se califican respuestas de la IA" });
    }

    const values = { rating: b.rating ?? null, correction: b.correction || null, comment: b.comment || null };
    const [existing] = await db.select({ id: aiFeedback.id }).from(aiFeedback).where(targetWhere(userId, b)).limit(1);
    let id: number;
    if (existing) {
      await db.update(aiFeedback).set(values).where(eq(aiFeedback.id, existing.id));
      id = existing.id;
    } else {
      [{ insertId: id }] = await db.insert(aiFeedback).values({ userId, findingId: b.findingId ?? null, messageId: b.messageId ?? null, ...values });
    }
    await audit(req, { action: "feedback.save", entityType: b.findingId !== undefined ? "finding" : "message", entityId: (b.findingId ?? b.messageId)!, details: { rating: b.rating ?? null, hasCorrection: Boolean(b.correction) } });

    const [saved] = await db.select().from(aiFeedback).where(eq(aiFeedback.id, id));
    res.status(existing ? 200 : 201).json(saved);
  } catch (err) {
    next(err);
  }
});

/** Calificación propia de un hallazgo o mensaje (null si aún no calificó). */
router.get("/", async (req, res, next) => {
  try {
    const q = targetQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.flatten() });
    const [row] = await db.select().from(aiFeedback).where(targetWhere(req.user!.id, q.data)).limit(1);
    res.json(row ?? null);
  } catch (err) {
    next(err);
  }
});

export default router;
