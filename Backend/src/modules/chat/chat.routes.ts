import { Router, type Request } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { validate } from "#src/middlewares/validate.middleware.js";
import { authMiddleware, requirePermission } from "#src/middlewares/auth.middleware.js";
import { audit } from "#src/modules/auth/auth.service.js";
import { ragCall, ragStream, readNdjson } from "#src/modules/rag/rag.client.js";
import { chatConversations, chatMessages } from "#src/modules/chat/schema/chat.schema.js";

const router = Router();
router.use(authMiddleware, requirePermission("chat.use"));

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  conversationId: z.number().int().positive().optional(),
  k: z.number().int().min(1).max(50).optional(),
});

const parseId = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);

async function ownsConversation(conversationId: number, userId: number) {
  const [own] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)))
    .limit(1);
  return Boolean(own);
}

/**
 * Guarda la pregunta y su respuesta (necesario para poder calificarlas, CU-13) y crea la conversación si es nueva.
 * `lowConfidence` se marca cuando FastAPI no devolvió ninguna fuente que respalde la respuesta.
 */
async function saveExchange(req: Request, question: string, answer: string, sources: unknown[], conversationId?: number) {
  const convId =
    conversationId ??
    (await db.insert(chatConversations).values({ userId: req.user!.id, title: question.slice(0, 80) }))[0].insertId;
  const lowConfidence = sources.length === 0;

  const [userMsg] = await db.insert(chatMessages).values({ conversationId: convId, sender: "usuario", content: question });
  const [aiMsg] = await db.insert(chatMessages).values({ conversationId: convId, sender: "asistente", content: answer, sources, lowConfidence });
  await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
  await audit(req, { action: "chat.ask", entityType: "conversation", entityId: convId });

  return { conversationId: convId, userMessageId: userMsg.insertId, messageId: aiMsg.insertId, lowConfidence };
}

/* Pregunta al RAG y devuelve la respuesta completa. */
router.post("/ask", validate(askSchema), async (req, res, next) => {
  try {
    const { question, conversationId, k } = req.body as z.infer<typeof askSchema>;

    if (conversationId && !(await ownsConversation(conversationId, req.user!.id))) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    const rag = await ragCall<{ answer: string; sources: unknown[] }>("POST", "/ask", { question, ...(k && { k }) });
    if (!rag.ok) return res.status(rag.status >= 500 ? 502 : rag.status).json({ error: "FastAPI no pudo responder", detail: rag.body });

    const sources = Array.isArray(rag.body.sources) ? rag.body.sources : [];
    const saved = await saveExchange(req, question, rag.body.answer, sources, conversationId);

    res.json({
      conversationId: saved.conversationId,
      userMessageId: saved.userMessageId,
      message: { id: saved.messageId, sender: "asistente", content: rag.body.answer, sources, lowConfidence: saved.lowConfidence },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Igual que /ask, pero la respuesta se reenvía por partes (NDJSON) a medida que el modelo la escribe:
 * "sources", varios "delta" y al final "done" (con los ids ya guardados) o "error".
 * Solo se guarda en la base una respuesta completa.
 */
router.post("/ask/stream", validate(askSchema), async (req, res, next) => {
  const send = (event: Record<string, unknown>) => res.write(JSON.stringify(event) + "\n");
  // Si el navegador se va, se corta también la generación en FastAPI.
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    const { question, conversationId, k } = req.body as z.infer<typeof askSchema>;

    if (conversationId && !(await ownsConversation(conversationId, req.user!.id))) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    const upstream = await ragStream("/ask/stream", { question, ...(k && { k }) }, abort.signal);
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: "FastAPI no pudo responder", detail });
    }

    res.status(200);
    res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("x-accel-buffering", "no"); // que nginx no acumule la respuesta
    res.flushHeaders();

    let answer = "";
    let sources: unknown[] = [];
    for await (const event of readNdjson(upstream.body)) {
      if (event.type === "sources") {
        sources = Array.isArray(event.sources) ? event.sources : [];
        send({ type: "sources", sources });
      } else if (event.type === "delta") {
        answer += event.text;
        send({ type: "delta", text: event.text });
      } else if (event.type === "done") {
        send({ type: "done", ...(await saveExchange(req, question, answer, sources, conversationId)) });
        return res.end();
      } else if (event.type === "error") {
        break;
      }
    }
    send({ type: "error", error: "La respuesta se interrumpió antes de terminar" });
    res.end();
  } catch (err) {
    if (abort.signal.aborted) return;
    // Con la respuesta ya empezada no se puede cambiar el status: se avisa como un evento.
    if (!res.headersSent) return next(err);
    console.error("[chat] streaming:", err);
    send({ type: "error", error: "La respuesta se interrumpió antes de terminar" });
    res.end();
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
