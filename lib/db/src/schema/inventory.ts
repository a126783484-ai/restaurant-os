import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("其他"),
  unit: text("unit").notNull().default("個"),
  quantity: real("quantity").notNull().default(0),
  minQuantity: real("min_quantity").notNull().default(0),
  cost: real("cost").notNull().default(0),
  supplier: text("supplier"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventoryTable.$inferSelect;
