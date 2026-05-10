import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const visitsTable = pgTable("visits", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
  amount: real("amount").notNull().default(0),
  orderType: text("order_type").notNull().default("dine-in"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVisitSchema = createInsertSchema(visitsTable).omit({
  id: true, createdAt: true,
});
export type InsertVisit = z.infer<typeof insertVisitSchema>;
export type Visit = typeof visitsTable.$inferSelect;
