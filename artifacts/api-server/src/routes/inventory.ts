import { Router, type IRouter } from "express";
import { eq, asc, lt, sql } from "drizzle-orm";
import { db, inventoryTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/inventory", async (req, res): Promise<void> => {
  const { category, lowStock } = req.query as Record<string, string>;

  const rows = await db
    .select()
    .from(inventoryTable)
    .where(
      lowStock === "true"
        ? sql`${inventoryTable.quantity} <= ${inventoryTable.minQuantity}`
        : category
        ? eq(inventoryTable.category, category)
        : undefined
    )
    .orderBy(asc(inventoryTable.category), asc(inventoryTable.name));

  res.json(rows);
});

router.post("/inventory", async (req, res): Promise<void> => {
  const { name, category, unit, quantity, minQuantity, cost, supplier, notes } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [item] = await db.insert(inventoryTable).values({
    name,
    category: category ?? "其他",
    unit: unit ?? "個",
    quantity: Number(quantity ?? 0),
    minQuantity: Number(minQuantity ?? 0),
    cost: Number(cost ?? 0),
    supplier: supplier || undefined,
    notes: notes || undefined,
  }).returning();
  res.status(201).json(item);
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, category, unit, quantity, minQuantity, cost, supplier, notes } = req.body ?? {};

  const updates: Partial<typeof inventoryTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (category !== undefined) updates.category = category;
  if (unit !== undefined) updates.unit = unit;
  if (quantity !== undefined) updates.quantity = Number(quantity);
  if (minQuantity !== undefined) updates.minQuantity = Number(minQuantity);
  if (cost !== undefined) updates.cost = Number(cost);
  if (supplier !== undefined) updates.supplier = supplier;
  if (notes !== undefined) updates.notes = notes;

  const [item] = await db.update(inventoryTable).set(updates).where(eq(inventoryTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.delete("/inventory/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(inventoryTable).where(eq(inventoryTable.id, id));
  res.status(204).end();
});

export default router;
