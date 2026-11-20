import { datetime } from "drizzle-orm/mysql-core";

// Fechas en UTC, asignadas desde la app para que coincidan con las comparaciones en JS.
export const createdAt = () => datetime("created_at").$defaultFn(() => new Date());
export const updatedAt = () =>
  datetime("updated_at")
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
