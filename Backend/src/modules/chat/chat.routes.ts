import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { validate } from "#src/middlewares/validate.middleware.js";
import { authMiddleware, requirePermission } from "#src/middlewares/auth.middleware.js";
import { audit } from "#src/modules/auth/auth.service.js";
import { ragCall } from "#src/modules/rag/rag.client.js";
import { chatConversations, chatMessages } from "#src/modules/chat/schema/chat.schema.js";

const router = Router();
router.use(authMiddleware, requirePermission("chat.use"));

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  conversationId: z.number().int().positive().optional(),
  k: z.number().int().min(1).max(50).optional(),
});

const parseId = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);

/**
 * Pregunta al RAG y guarda la conversación (necesaria para poder calificar respuestas, CU-13).
 * `lowConfidence` se marca cuando FastAPI no devolvió ninguna fuente que respalde la respuesta.
 */
router.post("/ask", validate(askSchema), async (req, res, next) => {
  try {
    const { question, conversationId, k } = req.body as z.infer<typeof askSchema>;

    if (conversationId) {
      const [own] = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, req.user!.id)))
        .limit(1);
      if (!own) return res.status(404).json({ error: "Conversación no encontrada" });
    }

    const rag = await ragCall<{ answer: string; sources: unknown[] }>("POST", "/ask", { question, ...(k && { k }) });
    if (!rag.ok) return res.status(rag.status >= 500 ? 502 : rag.status).json({ error: "FastAPI no pudo responder", detail: rag.body });

    const sources = Array.isArray(rag.body.sources) ? rag.body.sources : [];
    const convId =
      conversationId ??
      (await db.insert(chatConversations).values({ userId: req.user!.id, title: question.slice(0, 80) }))[0].insertId;

    const [userMsg] = await db.insert(chatMessages).values({ conversationId: convId, sender: "usuario", content: question });
    const [aiMsg] = await db
      .insert(chatMessages)
      .values({ conversationId: convId, sender: "asistente", content: rag.body.answer, sources, lowConfidence: sources.length === 0 });
    await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
    await audit(req, { action: "chat.ask", entityType: "conversation", entityId: convId });

    res.json({
      conversationId: convId,
      userMessageId: userMsg.insertId,
      message: { id: aiMsg.insertId, sender: "asistente", content: rag.body.answer, sources, lowConfidence: sources.length === 0 },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/conversations", async (req, res, next) => {
  try {
    res.json(await db.select().from(chatConversations).where(eq(chatConversations.userId, req.user!.id)).orderBy(desc(chatConversations.updatedAt)));
  } catch (err) {
    next(err);
  }
});

router.get("/conversations/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const [conv] = await db
      .select()
      .from(chatConversations)
      .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, req.user!.id)))
      .limit(1);
    if (!conv) return res.status(404).json({ error: "Conversación no encontrada" });
    res.json({ conversation: conv, messages: await db.select().from(chatMessages).where(eq(chatMessages.conversationId, id)).orderBy(asc(chatMessages.id)) });
  } catch (err) {
    next(err);
  }
});

export default router;
