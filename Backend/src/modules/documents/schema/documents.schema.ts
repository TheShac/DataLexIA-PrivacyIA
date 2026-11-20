import { mysqlTable, int, varchar, char, boolean, date, mysqlEnum, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { createdAt, updatedAt } from "../../../config/columns.js";
import { users } from "../../users/schema/users.schema.js";

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: int("size_bytes").notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  category: varchar("category", { length: 60 }),
  version: int("version").notNull().default(1),
  previousVersionId: int("previous_version_id").references((): AnyMySqlColumn => documents.id),
  status: mysqlEnum("status", ["cargado", "procesando", "indexado", "error", "archivado"]).notNull().default("cargado"),
  isEnabledSource: boolean("is_enabled_source").notNull().default(false), // RF-04
  validFrom: date("valid_from", { mode: "string" }),
  validUntil: date("valid_until", { mode: "string" }),
  ragDocumentId: int("rag_document_id"), // documents.id en PostgreSQL (RAG)
  uploadedBy: int("uploaded_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
