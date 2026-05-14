import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("paid"),
  note: text("note"),
  externalReference: text("external_reference"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (table) => ({
  orderIdIdx: index("idx_payments_order_id").on(table.orderId),
  createdAtIdx: index("idx_payments_created_at").on(table.createdAt),
  methodIdx: index("idx_payments_method").on(table.method),
  statusIdx: index("idx_payments_status").on(table.status),
}));

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true, createdAt: true, updatedAt: true, refundedAt: true, cancelledAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
