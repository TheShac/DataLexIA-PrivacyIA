import type { analyses, findings } from "#src/modules/analyses/schema/analyses.schema.js";

type Analysis = typeof analyses.$inferSelect;
type Finding = typeof findings.$inferSelect;

export interface DpiaInput {
  analysis: Analysis;
  document: { title: string; filename: string; version: number };
  requestedBy: string;
  findings: Finding[];
}

const PENDING = "_Pendiente: debe completarlo el responsable del tratamiento._";
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n+/g, " ");
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

/**
 * CU-09. Borrador de Evaluación de Impacto (DPIA) armado solo con los datos ya guardados del análisis.
 * Las secciones que requieren conocimiento del negocio se dejan como pendientes: no se inventan.
 */
export function buildDpia({ analysis, document, requestedBy, findings: all }: DpiaInput) {
  const items = all.filter((f) => f.status !== "rechazado").sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9));
  const cfg = (analysis.config ?? {}) as { models?: Record<string, string> | null; laws?: { filename: string }[] | null };
  const pendingReview = items.filter((f) => f.status === "pendiente" || f.status === "segunda_revision").length;

  const risks = items.length
    ? [
        "| Prioridad | Gravedad | Ubicación | Riesgo | Artículos |",
        "|---|---|---|---|---|",
        ...items.map(
          (f) =>
            `| ${f.priority ?? "—"} | ${f.severity} | ${esc(f.location)} | ${esc(f.explanation)} | ${esc(((f.articles as string[]) ?? []).join(", ") || "—")} |`,
        ),
      ].join("\n")
    : "No se identificaron incumplimientos.";

  const measures = items.length
    ? items.map((f) => `${f.priority ?? "—"}. **${f.location}** (${f.severity}): ${f.mitigation ? f.mitigation.replace(/\n+/g, "\n   ") : "_Medida pendiente de definir._"}`).join("\n")
    : "No se requieren medidas.";

  const sections = [
    {
      title: "1. Identificación",
      content: [
        `- Documento evaluado: ${document.title} (${document.filename}, versión ${document.version})`,
        `- Análisis N.º ${analysis.id}, solicitado por ${requestedBy}`,
        `- Fecha del análisis: ${fmt(analysis.finishedAt ?? analysis.createdAt)}`,
        `- Normativa de referencia: ${cfg.laws?.map((l) => l.filename).join(", ") || "no registrada"}`,
        `- Modelos de IA: ${cfg.models ? Object.keys(cfg.models).join(", ") : "no registrados"}`,
      ].join("\n"),
    },
    { title: "2. Descripción del tratamiento", content: `Finalidades, categorías de datos, titulares, destinatarios y plazos de conservación.\n\n${PENDING}` },
    { title: "3. Necesidad y proporcionalidad", content: `Base de licitud, minimización de datos y medios para el ejercicio de derechos.\n\n${PENDING}` },
    { title: "4. Riesgos identificados", content: risks },
    { title: "5. Medidas propuestas", content: measures },
    {
      title: "6. Conclusión",
      content:
        `Resultado del análisis automático: **${analysis.overall === "cumple" ? "cumple" : "no cumple"}** ` +
        `(altos: ${analysis.countHigh ?? 0}, medios: ${analysis.countMedium ?? 0}, leves: ${analysis.countLow ?? 0}).`,
    },
    {
      title: "7. Estado de revisión",
      content:
        `Borrador generado con apoyo de IA. ${pendingReview} de ${items.length} hallazgos están pendientes de revisión humana. ` +
        "Este documento no es válido hasta que un revisor valide los hallazgos y el responsable complete las secciones pendientes.",
    },
  ];

  const title = `Borrador de DPIA — ${document.title}`;
  const markdown = `# ${title}\n\n${sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n")}\n`;
  return { title, status: "borrador" as const, sections, markdown };
}
