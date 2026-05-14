import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("idx_audit_logs_entity").on(table.entityType, table.entityId),
  actorIdx: index("idx_audit_logs_actor").on(table.actorUserId),
  createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
}));

export type AuditLog = typeof auditLogsTable.$inferSelect;
