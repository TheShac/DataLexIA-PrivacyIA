import { mysqlTable, int, varchar, tinyint, datetime, mysqlEnum, primaryKey, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { createdAt, updatedAt } from "../../../config/columns.js";

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(), // admin, analista, gestor, revisor, auditor, direccion
  name: varchar("name", { length: 80 }).notNull(),
  description: varchar("description", { length: 255 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  description: varchar("description", { length: 255 }).notNull(),
});

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: int("role_id").notNull().references(() => roles.id),
    permissionId: int("permission_id").notNull().references(() => permissions.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionId] }) }),
);

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("full_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  roleId: int("role_id").notNull().references(() => roles.id),
  status: mysqlEnum("status", ["activo", "desactivado"]).notNull().default("activo"),
  failedLoginAttempts: tinyint("failed_login_attempts").notNull().default(0), // 5 intentos = bloqueo (CU-01)
  lockedUntil: datetime("locked_until"),
  lastLoginAt: datetime("last_login_at"),
  passwordChangedAt: datetime("password_changed_at"),
  createdBy: int("created_by").references((): AnyMySqlColumn => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deactivatedAt: datetime("deactivated_at"),
});

export type User = typeof users.$inferSelect;
