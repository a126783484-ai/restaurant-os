import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, pool, tablesTable } from "@workspace/db";
import { listRuntimeTables } from "../lib/one-store-runtime";
import {
  CreateTableBody,
  UpdateTableParams,
  UpdateTableBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ACTIVE_ORDER_STATUSES = ["pending", "preparing", "ready"];
const ACTIVE_RESERVATION_STATUSES = ["pending", "confirmed", "seated"];

router.get("/tables", async (_req, res): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.json(listRuntimeTables());
    return;
  }

  const tables = await db.select().from(tablesTable).orderBy(tablesTable.number);
  res.json(tables);
});

router.post("/tables", async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { number, capacity, section, notes } = parsed.data;
  if (typeof number !== "number" || typeof capacity !== "number") {
    res.status(400).json({ error: "Table number and capacity are required" });
    return;
  }

  const [table] = await db
    .insert(tablesTable)
    .values({
      number,
      capacity,
      section: section ?? "main",
      notes,
    })
    .returning();
  res.status(201).json(table);
});

router.patch("/tables/:id", async (req, res): Promise<void> => {
  const params = UpdateTableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [table] = await db.update(tablesTable).set(parsed.data).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) {
    res.status(404).json({ error: "Table not found" });
    return;
  }
  res.json(table);
});

router.delete("/tables/:id", async (req, res): Promise<void> => {
  const params = UpdateTableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!isDatabaseConfigured()) {
    res.status(501).json({ error: "Deleting runtime fallback tables is not supported." });
    return;
  }

  const tableId = params.data.id;

  const activeOrders = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM orders WHERE table_id = $1 AND status = ANY($2::text[])",
    [tableId, ACTIVE_ORDER_STATUSES],
  );

  if (Number(activeOrders.rows[0]?.count ?? 0) > 0) {
    res.status(409).json({
      error: "Table has active orders and cannot be deleted.",
      code: "TABLE_HAS_ACTIVE_ORDERS",
    });
    return;
  }

  const activeReservations = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM reservations WHERE table_id = $1 AND status = ANY($2::text[])",
    [tableId, ACTIVE_RESERVATION_STATUSES],
  );

  if (Number(activeReservations.rows[0]?.count ?? 0) > 0) {
    res.status(409).json({
      error: "Table has active reservations and cannot be deleted.",
      code: "TABLE_HAS_ACTIVE_RESERVATIONS",
    });
    return;
  }

  const [deleted] = await db.delete(tablesTable).where(eq(tablesTable.id, tableId)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Table not found" });
    return;
  }

  res.status(204).send();
});

export default router;
