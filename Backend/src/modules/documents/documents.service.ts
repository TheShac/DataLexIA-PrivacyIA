import { eq } from "drizzle-orm";
import { db } from "#src/config/db.js";
import { ragCall } from "#src/modules/rag/rag.client.js";
import { documents } from "#src/modules/documents/schema/documents.schema.js";

export type DocumentRow = typeof documents.$inferSelect;

/** Las leyes van a /laws en FastAPI; el resto de documentos a /documents. */
export const LAW_CATEGORY = "ley";
export const ragBase = (category: string | null) => (category === LAW_CATEGORY ? "/laws" : "/documents");

export async function ragUpload(category: string | null, file: { buffer: Buffer; originalname: string; mimetype: string }) {
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  return ragCall<{ id: number; filename: string; chunks: number; anonymized?: Record<string, number>; articles?: number; detail?: unknown }>(
    "POST",
    ragBase(category),
    form,
  );
}

/** Quita el documento del índice de FastAPI. Un 404 se considera ya borrado. */
export async function ragRemove(doc: Pick<DocumentRow, "category" | "ragDocumentId">): Promise<{ ok: boolean; detail?: unknown }> {
  if (doc.ragDocumentId == null) return { ok: true };
  const r = await ragCall("DELETE", `${ragBase(doc.category)}/${doc.ragDocumentId}`);
  return r.ok || r.status === 404 ? { ok: true } : { ok: false, detail: r.body };
}

/** Archivar = sacar del índice RAG, deshabilitar como fuente y marcar `archivado`. */
export async function archiveDocument(doc: DocumentRow): Promise<{ ok: boolean; detail?: unknown }> {
  const removed = await ragRemove(doc);
  if (!removed.ok) return removed;
  await db.update(documents).set({ status: "archivado", isEnabledSource: false }).where(eq(documents.id, doc.id));
  return { ok: true };
}
