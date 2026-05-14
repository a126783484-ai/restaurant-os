import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, pool, tablesTable } from "@workspace/db";
import {
  createRuntimeTable,
  deleteRuntimeTable,
  listRuntimeTables,
  updateRuntimeTable,
} from "../lib/one-store-runtime";
import {
  CreateTableBody,
  UpdateTableParams,
  UpdateTableBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ACTIVE_ORDER_STATUSES = ["open", "pending", "preparing", "ready"];
const ACTIVE_RESERVATION_STATUSES = ["pending", "confirmed", "seated"];

function sendError(res: Parameters<Parameters<IRouter["get"]>[1]>[1], status: number, code: string, message: string): void {
  res.status(status).json({
    ok: false,
    error: { code, message },
    message,
    timestamp: new Date().toISOString(),
  });
}

router.get("/tables", async (_req, res): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.json(listRuntimeTables());
    return;
  }

  const tables = await db
    .select()
    .from(tablesTable)
    .orderBy(tablesTable.number);
  res.json(tables);
});

router.post("/tables", async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", parsed.error.message);
    return;
  }

  const { number, capacity, section, notes } = parsed.data;
  if (typeof number !== "number" || typeof capacity !== "number") {
    sendError(res, 400, "VALIDATION_ERROR", "Table number and capacity are required");
    return;
  }

  if (!isDatabaseConfigured()) {
    try {
      res
        .status(201)
        .json(createRuntimeTable({ number, capacity, section, notes }));
    } catch (error: any) {
      sendError(res, error?.statusCode ?? 400, error?.code ?? "VALIDATION_ERROR", error?.message ?? "Table create failed");
    }
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
    sendError(res, 400, "VALIDATION_ERROR", params.error.message);
    return;
  }
  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", parsed.error.message);
    return;
  }
  if (!isDatabaseConfigured()) {
    const table = updateRuntimeTable(params.data.id, parsed.data);
    if (!table) {
      sendError(res, 404, "TABLE_NOT_FOUND", "Table not found");
      return;
    }
    res.json(table);
    return;
  }

  const [table] = await db
    .update(tablesTable)
    .set(parsed.data)
    .where(eq(tablesTable.id, params.data.id))
    .returning();
  if (!table) {
    sendError(res, 404, "TABLE_NOT_FOUND", "Table not found");
    return;
  }
  res.json(table);
});

router.delete("/tables/:id", async (req, res): Promise<void> => {
  const params = UpdateTableParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "VALIDATION_ERROR", params.error.message);
    return;
  }

  const tableId = params.data.id;

  if (!isDatabaseConfigured()) {
    try {
      const deleted = deleteRuntimeTable(tableId);
      if (!deleted) {
        sendError(res, 404, "TABLE_NOT_FOUND", "Table not found");
        return;
      }
      res.status(204).send();
    } catch (error: any) {
      sendError(res, error?.statusCode ?? 400, error?.code ?? "VALIDATION_ERROR", error?.message ?? "Table delete failed");
    }
    return;
  }

  const activeOrders = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM orders WHERE table_id = $1 AND status = ANY($2::text[])",
    [tableId, ACTIVE_ORDER_STATUSES],
  );

  if (Number(activeOrders.rows[0]?.count ?? 0) > 0) {
    sendError(res, 409, "TABLE_HAS_ACTIVE_ORDER", "Table has active orders and cannot be deleted.");
    return;
  }

  const activeReservations = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM reservations WHERE table_id = $1 AND status = ANY($2::text[])",
    [tableId, ACTIVE_RESERVATION_STATUSES],
  );

  if (Number(activeReservations.rows[0]?.count ?? 0) > 0) {
    sendError(res, 409, "TABLE_HAS_ACTIVE_RESERVATION", "Table has active reservations and cannot be deleted.");
    return;
  }

  const [deleted] = await db
    .delete(tablesTable)
    .where(eq(tablesTable.id, tableId))
    .returning();
  if (!deleted) {
    sendError(res, 404, "TABLE_NOT_FOUND", "Table not found");
    return;
  }

  res.status(204).send();
});

export default router;
