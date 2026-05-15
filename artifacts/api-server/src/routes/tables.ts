import {
  Router,
  type IRouter,
  type NextFunction,
  type Response,
} from "express";
import { eq } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  isDatabaseUnavailableError,
  pool,
  tablesTable,
} from "@workspace/db";
import {
  createRuntimeTable,
  deleteRuntimeTable,
  listRuntimeTables,
  updateRuntimeTable,
} from "../lib/one-store-runtime";
import { ACTIVE_DINE_IN_ORDER_STATUSES } from "../lib/order-domain-service";
import {
  CreateTableBody,
  UpdateTableParams,
  UpdateTableBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ACTIVE_ORDER_STATUSES = [...ACTIVE_DINE_IN_ORDER_STATUSES];
const ACTIVE_RESERVATION_STATUSES = ["pending", "confirmed", "seated"];

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({
    ok: false,
    error: { code, message },
    message,
    timestamp: new Date().toISOString(),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "23505",
  );
}

function handleTableError(
  res: Response,
  next: NextFunction,
  error: unknown,
): void {
  if (isUniqueViolation(error)) {
    sendError(
      res,
      409,
      "TABLE_NUMBER_EXISTS",
      "A table with this number already exists.",
    );
    return;
  }
  if (isDatabaseUnavailableError(error)) {
    sendError(
      res,
      503,
      "DATABASE_UNAVAILABLE",
      "Database unavailable. Please retry shortly.",
    );
    return;
  }
  next(error);
}

router.get("/tables", async (_req, res, next): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.json(listRuntimeTables());
    return;
  }

  try {
    const tables = await db
      .select()
      .from(tablesTable)
      .orderBy(tablesTable.number);
    res.json(tables);
  } catch (error) {
    handleTableError(res, next, error);
  }
});

router.post("/tables", async (req, res, next): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", parsed.error.message);
    return;
  }

  const { number, capacity, section, notes } = parsed.data;
  if (typeof number !== "number" || typeof capacity !== "number") {
    sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "Table number and capacity are required",
    );
    return;
  }

  if (!isDatabaseConfigured()) {
    try {
      res
        .status(201)
        .json(createRuntimeTable({ number, capacity, section, notes }));
    } catch (error: any) {
      sendError(
        res,
        error?.statusCode ?? 400,
        error?.code ?? "VALIDATION_ERROR",
        error?.message ?? "Table create failed",
      );
    }
    return;
  }

  try {
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
  } catch (error) {
    handleTableError(res, next, error);
  }
});

router.patch("/tables/:id", async (req, res, next): Promise<void> => {
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

  try {
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
  } catch (error) {
    handleTableError(res, next, error);
  }
});

router.delete("/tables/:id", async (req, res, next): Promise<void> => {
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
      sendError(
        res,
        error?.statusCode ?? 400,
        error?.code ?? "VALIDATION_ERROR",
        error?.message ?? "Table delete failed",
      );
    }
    return;
  }

  try {
    const activeOrders = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::int AS count FROM orders WHERE table_id = $1 AND status = ANY($2::text[])",
      [tableId, ACTIVE_ORDER_STATUSES],
    );

    if (Number(activeOrders.rows[0]?.count ?? 0) > 0) {
      sendError(
        res,
        409,
        "TABLE_HAS_ACTIVE_ORDER",
        "Table has active orders and cannot be deleted.",
      );
      return;
    }

    const activeReservations = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::int AS count FROM reservations WHERE table_id = $1 AND status = ANY($2::text[])",
      [tableId, ACTIVE_RESERVATION_STATUSES],
    );

    if (Number(activeReservations.rows[0]?.count ?? 0) > 0) {
      sendError(
        res,
        409,
        "TABLE_HAS_ACTIVE_RESERVATION",
        "Table has active reservations and cannot be deleted.",
      );
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
  } catch (error) {
    handleTableError(res, next, error);
  }
});

export default router;
