import { mysqlTable, int, bigint, varchar, text, json, boolean, mysqlEnum } from "drizzle-orm/mysql-core";
import { createdAt, updatedAt } from "../../../config/columns.js";
import { users } from "../../users/schema/users.schema.js";

export const chatConversations = mysqlTable("chat_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id),
  title: varchar("title", { length: 200 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const chatMessages = mysqlTable("chat_messages", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  conversationId: int("conversation_id").notNull().references(() => chatConversations.id),
  sender: mysqlEnum("sender", ["usuario", "asistente"]).notNull(),
  content: text("content").notNull(),
  sources: json("sources"),
  lowConfidence: boolean("low_confidence").notNull().default(false),
  createdAt: createdAt(),
});
