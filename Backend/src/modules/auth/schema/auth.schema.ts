import { mysqlTable, int, bigint, char, varchar, json, datetime } from "drizzle-orm/mysql-core";
import { createdAt } from "../../../config/columns.js";
import { users } from "../../users/schema/users.schema.js";

export const sessions = mysqlTable("sessions", {
  id: char("id", { length: 36 }).primaryKey(), // UUID
  userId: int("user_id").notNull().references(() => users.id),
  tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
  ip: varchar("ip", { length: 45 }),
  userAgent: varchar("user_agent", { length: 255 }),
  createdAt: createdAt(),
  expiresAt: datetime("expires_at").notNull(),
  revokedAt: datetime("revoked_at"),
});

export const auditLog = mysqlTable("audit_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("user_id").references(() => users.id),
  action: varchar("action", { length: 64 }).notNull(), // auth.login, user.create, finding.review, ...
  entityType: varchar("entity_type", { length: 40 }),
  entityId: varchar("entity_id", { length: 64 }),
  details: json("details"),
  ip: varchar("ip", { length: 45 }),
  createdAt: createdAt(),
});
