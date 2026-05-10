import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  paymentStatus: text("payment_status"),
  paymentMethod: text("payment_method"),
  subtotal: real("subtotal"),
  discount: real("discount"),
  serviceCharge: real("service_charge"),
  actualPaid: real("actual_paid"),
  paymentTime: timestamp("payment_time", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true, paymentTime: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
