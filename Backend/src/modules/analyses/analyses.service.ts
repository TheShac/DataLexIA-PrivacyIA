import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "#src/config/db.js";
import { ragCall } from "#src/modules/rag/rag.client.js";
import { analyses, findings } from "#src/modules/analyses/schema/analyses.schema.js";

type Severity = "alto" | "medio" | "leve";
const SEVERITIES: Severity[] = ["alto", "medio", "leve"];
const SEVERITY_WEIGHT: Record<Severity, number> = { alto: 3, medio: 2, leve: 1 };

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/* ---- Cola: el modelo local es lento, así que los trabajos se ejecutan de uno en uno. ---- */
let tail: Promise<unknown> = Promise.resolve();
const enqueue = (job: () => Promise<void>) => {
  tail = tail.then(job, job).catch((err) => console.error("[analyses] job falló:", err));
};

const pendingMitigations = new Set<number>();
export const hasPendingMitigations = (analysisId: number) => pendingMitigations.has(analysisId);

/** Al arrancar, los análisis que quedaron a medias (reinicio del servidor) se marcan como error. */
export async function failStaleAnalyses() {
  await db
    .update(analyses)
    .set({ status: "error", errorMessage: "Interrumpido por reinicio del servidor", finishedAt: new Date() })
    .where(inArray(analyses.status, ["pendiente", "en_proceso"]));
}

/** Parámetros reproducibles del análisis (RNF-13): modelos y leyes vigentes al momento de pedirlo. */
export async function captureConfig(k: number | undefined, filename: string) {
  const [health, laws] = await Promise.all([ragCall("GET", "/health").catch(() => null), ragCall("GET", "/laws").catch(() => null)]);
  return {
    filename,
    k: k ?? null,
    models: health?.ok ? health.body.models : null,
    laws: laws?.ok && Array.isArray(laws.body) ? laws.body.map((l: any) => ({ id: l.id, filename: l.filename })) : null,
  };
}

export function enqueueAnalysis(analysisId: number, file: UploadedFile, k?: number) {
  enqueue(() => runAnalysis(analysisId, file, k));
}

async function runAnalysis(analysisId: number, file: UploadedFile, k?: number) {
  await db.update(analyses).set({ status: "en_proceso", startedAt: new Date() }).where(eq(analyses.id, analysisId));
  try {
    const form = new FormData();
    form.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname);
    const r = await ragCall("POST", `/compliance${k ? `?k=${k}` : ""}`, form);
    if (!r.ok) throw new Error(`FastAPI respondió ${r.status}: ${JSON.stringify(r.body).slice(0, 500)}`);

    const report = r.body;
    const rows = SEVERITIES.flatMap((sev) =>
      ((report.issues?.[sev] ?? []) as any[]).map((i) => ({
        analysisId,
        severity: sev,
        location: String(i.location ?? "").slice(0, 100) || "Todo el documento",
        page: i.page ?? null,
        startLine: i.start_line ?? null,
        endLine: i.end_line ?? null,
        fragment: i.fragment ?? null,
        quote: i.quote ?? null,
        articles: i.articles ?? [],
        sources: i.sources ?? null,
        // FastAPI ya incluye "Falta: …" dentro de explanation; `missing` solo se usa si viene vacía.
        explanation: i.explanation || (i.missing ? `Falta: ${i.missing}` : "Sin explicación"),
      })),
    );
    if (rows.length) await db.insert(findings).values(rows);
    await recomputePriority(analysisId);

    const count = (s: Severity) => rows.filter((x) => x.severity === s).length;
    await db
      .update(analyses)
      .set({
        status: "completado",
        overall: rows.length === 0 ? "cumple" : "no_cumple",
        countHigh: count("alto"),
        countMedium: count("medio"),
        countLow: count("leve"),
        finishedAt: new Date(),
      })
      .where(eq(analyses.id, analysisId));
  } catch (err) {
    await db
      .update(analyses)
      .set({ status: "error", errorMessage: err instanceof Error ? err.message : String(err), finishedAt: new Date() })
      .where(eq(analyses.id, analysisId));
  }
}

/**
 * CU-08. Orden de urgencia: gravedad (alto > medio > leve), luego más artículos vulnerados,
 * luego orden de aparición. Los hallazgos rechazados en la revisión quedan sin prioridad.
 */
export async function recomputePriority(analysisId: number) {
  const rows = await db.select().from(findings).where(eq(findings.analysisId, analysisId)).orderBy(asc(findings.id));
  const live = rows
    .filter((f) => f.status !== "rechazado")
    .sort(
      (a, b) =>
        SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
        ((b.articles as unknown[])?.length ?? 0) - ((a.articles as unknown[])?.length ?? 0) ||
        a.id - b.id,
    );
  await db.transaction(async (tx) => {
    await tx.update(findings).set({ priority: null }).where(and(eq(findings.analysisId, analysisId), eq(findings.status, "rechazado")));
    for (const [i, f] of live.entries()) await tx.update(findings).set({ priority: i + 1 }).where(eq(findings.id, f.id));
    // Los conteos del análisis reflejan los hallazgos vigentes (sin los rechazados en la revisión).
    const count = (s: Severity) => live.filter((f) => f.severity === s).length;
    await tx.update(analyses).set({ countHigh: count("alto"), countMedium: count("medio"), countLow: count("leve") }).where(eq(analyses.id, analysisId));
  });
}

/** CU-07. FastAPI no propone medidas, así que se piden al RAG (/ask) hallazgo por hallazgo. */
export function enqueueMitigations(analysisId: number) {
  pendingMitigations.add(analysisId);
  enqueue(async () => {
    try {
      const todo = await db
        .select()
        .from(findings)
        .where(and(eq(findings.analysisId, analysisId), isNull(findings.mitigation), ne(findings.status, "rechazado")))
        .orderBy(asc(findings.priority));
      for (const f of todo) {
        const question =
          "Eres asesor de cumplimiento de la Ley 21.719 de protección de datos personales. " +
          "Para el siguiente incumplimiento detectado en un documento, propone de 2 a 4 medidas concretas, " +
          "verificables y breves para corregirlo. Responde solo con una lista, sin introducción.\n\n" +
          `Gravedad: ${f.severity}\nFragmento: ${f.quote ?? f.fragment ?? ""}\n` +
          `Artículos: ${((f.articles as string[]) ?? []).join(", ")}\nProblema: ${f.explanation}`;
        const r = await ragCall("POST", "/ask", { question });
        if (r.ok && typeof r.body?.answer === "string" && r.body.answer.trim()) {
          await db.update(findings).set({ mitigation: r.body.answer.trim() }).where(eq(findings.id, f.id));
        } else {
          console.error(`[analyses] sin medida para hallazgo ${f.id}: FastAPI ${r.status}`);
        }
      }
    } finally {
      pendingMitigations.delete(analysisId);
    }
  });
}
