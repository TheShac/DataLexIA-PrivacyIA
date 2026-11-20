import { mysqlTable, int, smallint, text, json, datetime, decimal, mysqlEnum, varchar } from "drizzle-orm/mysql-core";
import { createdAt, updatedAt } from "../../../config/columns.js";
import { users } from "../../users/schema/users.schema.js";
import { documents } from "../../documents/schema/documents.schema.js";

export const analyses = mysqlTable("analyses", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("document_id").notNull().references(() => documents.id),
  requestedBy: int("requested_by").notNull().references(() => users.id),
  status: mysqlEnum("status", ["pendiente", "en_proceso", "completado", "error"]).notNull().default("pendiente"),
  overall: mysqlEnum("overall", ["cumple", "no_cumple"]),
  countHigh: smallint("count_high"),
  countMedium: smallint("count_medium"),
  countLow: smallint("count_low"),
  config: json("config").notNull(), // modelo, ley y parámetros (RNF-13)
  errorMessage: text("error_message"),
  startedAt: datetime("started_at"),
  finishedAt: datetime("finished_at"),
  createdAt: createdAt(),
});

const decision = ["aprobado", "modificado", "rechazado", "segunda_revision"] as const;

export const findings = mysqlTable("findings", {
  id: int("id").autoincrement().primaryKey(),
  analysisId: int("analysis_id").notNull().references(() => analyses.id),
  severity: mysqlEnum("severity", ["alto", "medio", "leve"]).notNull(),
  location: varchar("location", { length: 100 }).notNull(),
  page: smallint("page"),
  startLine: int("start_line"),
  endLine: int("end_line"),
  fragment: text("fragment"),
  quote: text("quote"),
  articles: json("articles").notNull(),
  sources: json("sources"), // fuentes legales devueltas por FastAPI (CU-11); no está en el SQL original
  explanation: text("explanation").notNull(),
  mitigation: text("mitigation"), // RF-09
  confidence: decimal("confidence", { precision: 4, scale: 3 }), // RF-13
  priority: smallint("priority"), // CU-08
  status: mysqlEnum("status", ["pendiente", ...decision]).notNull().default("pendiente"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const findingReviews = mysqlTable("finding_reviews", {
  id: int("id").autoincrement().primaryKey(),
  findingId: int("finding_id").notNull().references(() => findings.id),
  reviewerId: int("reviewer_id").notNull().references(() => users.id),
  decision: mysqlEnum("decision", decision).notNull(),
  comment: text("comment"),
  changes: json("changes"),
  createdAt: createdAt(),
});
