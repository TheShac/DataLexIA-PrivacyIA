import { mysqlTable, int, bigint, tinyint, text } from "drizzle-orm/mysql-core";
import { createdAt } from "../../../config/columns.js";
import { users } from "../../users/schema/users.schema.js";
import { findings } from "../../analyses/schema/analyses.schema.js";
import { chatMessages } from "../../chat/schema/chat.schema.js";

export const aiFeedback = mysqlTable("ai_feedback", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id),
  findingId: int("finding_id").references(() => findings.id),
  messageId: bigint("message_id", { mode: "number" }).references(() => chatMessages.id),
  rating: tinyint("rating"), // 1 a 5
  correction: text("correction"),
  comment: text("comment"),
  createdAt: createdAt(),
});
