import { Router, type IRouter, type Response } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  orderItemsTable,
  ordersTable,
  pool,
  productsTable,
} from "@workspace/db";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
} from "@workspace/api-zod";
import { getRequestUser } from "../middlewares/auth";
import {
  addPayment,
  canAddPayment,
  calculateOrderPaymentSummary,
  ensurePaymentSchema,
  getOrderPaymentBundle,
  syncOrderPaymentSummary,
  writeAuditLog,
  type PaymentMethod,
} from "../lib/payment-service";
import {
  createRuntimeOrder,
  getRuntimeOrder,
  listRuntimeOrders,
  updateRuntimeOrder,
} from "../lib/one-store-runtime";
import { attachResilientPaymentSummary } from "../lib/order-payment-resilience";
import {
  ACTIVE_DINE_IN_ORDER_STATUSES,
  KDS_ACTIVE_ORDER_STATUSES,
  groupKdsOrdersByStatus,
} from "../lib/order-domain-service";
import {
  assertOrderTransition,
  buildOrderItemSnapshot,
  centsToAmount,
  dbOrderStatus,
  dbOrderType,
  normalizeOrderStatus,
} from "../lib/v3-core";

const router: IRouter = Router();
const VALID_STATUSES = new Set([
  "open",
  "pending",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);
const VALID_PAYMENT_STATUSES = new Set([
  "unpaid",
  "partially_paid",
  "paid",
  "refunded",
  "cancelled",
]);
const VALID_PAYMENT_METHODS = new Set([
  "unpaid",
  "cash",
  "card",
  "transfer",
  "external",
]);
let orderSchemaReady: Promise<void> | null = null;

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

async function ensureOrderSchema(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  orderSchemaReady ??= (async () => {
    await pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount REAL NOT NULL DEFAULT 0",
    );
    await pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_note TEXT",
    );
    await pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ",
    );
    await pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT",
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders (idempotency_key)",
    );
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key_unique ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL",
    );
  })();
  await orderSchemaReady;
}

function getIdempotencyKey(
  req: Parameters<IRouter["post"]>[1] extends (...args: infer A) => any
    ? A[0]
    : any,
): string | null {
  const header = req.header("x-idempotency-key");
  const bodyKey =
    typeof req.body?.idempotencyKey === "string"
      ? req.body.idempotencyKey
      : null;
  const key = (header ?? bodyKey)?.trim();
  return key || null;
}

type NormalizedOrderItemInput = {
  productId: number;
  quantity: number;
  notes?: string | null;
};

type NormalizeUpdateResult =
  | {
      ok: true;
      update: Record<string, unknown>;
      items?: NormalizedOrderItemInput[];
    }
  | { ok: false; message: string };


function normalizeItems(items: unknown[]): NormalizedOrderItemInput[] {
  return items
    .map((item) => {
      const entry = item as Record<string, unknown>;
      const productId = Number(entry.productId);
      const quantity = Number(entry.quantity);
      if (!Number.isInteger(productId) || productId <= 0) {
        throw Object.assign(
          new Error("Each order item must include a valid productId."),
          { statusCode: 400 },
        );
      }
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw Object.assign(
          new Error(
            "Item quantity must be a number greater than or equal to 0.",
          ),
          { statusCode: 400 },
        );
      }
      return {
        productId,
        quantity,
        notes:
          typeof entry.notes === "string"
            ? entry.notes
            : entry.notes === null
              ? null
              : undefined,
      };
    })
    .filter((item) => item.quantity > 0);
}

function normalizeUpdate(data: Record<string, unknown>): NormalizeUpdateResult {
  const update: Record<string, unknown> = {};
  if (typeof data.status === "string") {
    if (!VALID_STATUSES.has(data.status))
      return { ok: false, message: "Invalid order status." };
    update.status = dbOrderStatus(data.status);
  }
  if (typeof data.paymentStatus === "string") {
    if (!VALID_PAYMENT_STATUSES.has(data.paymentStatus))
      return { ok: false, message: "Invalid payment status." };
    return { ok: false, message: "Payment status is derived from the payment ledger." };
  }
  if (typeof data.paymentMethod === "string") {
    if (!VALID_PAYMENT_METHODS.has(data.paymentMethod))
      return { ok: false, message: "Invalid payment method." };
  }
  if (typeof data.notes === "string" || data.notes === null)
    update.notes = data.notes;
  if (typeof data.paymentNote === "string" || data.paymentNote === null)
    update.paymentNote = data.paymentNote;
  if (typeof data.tableId === "number" || data.tableId === null)
    update.tableId = data.tableId;
  if (data.paidAmount !== undefined) {
    return { ok: false, message: "Paid amount is derived from the payment ledger." };
  }
  if (data.totalAmount !== undefined) {
    return { ok: false, message: "Order total is derived from item price snapshots." };
  }
  if (typeof data.paidAt === "string") {
    const paidAt = new Date(data.paidAt);
    if (Number.isNaN(paidAt.getTime()))
      return { ok: false, message: "paidAt must be a valid date." };
    update.paidAt = paidAt.toISOString();
  }
  if (data.paidAt === null) update.paidAt = null;
  let items: NormalizedOrderItemInput[] | undefined;
  if (Array.isArray(data.items)) {
    try {
      items = normalizeItems(data.items);
    } catch (error: any) {
      return { ok: false, message: error?.message ?? "Invalid order items." };
    }
    if (items.length === 0)
      return {
        ok: false,
        message: "Order must keep at least one item after editing.",
      };
  }
  return { ok: true, update, items };
}

async function buildDbItems(
  items: Array<{ productId: number; quantity: number; notes?: string | null }>,
) {
  let totalAmount = 0;
  const enrichedItems = [];
  for (const item of items) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product)
      throw Object.assign(new Error(`Product ${item.productId} not found`), {
        statusCode: 400,
      });
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const snapshot = buildOrderItemSnapshot({
      productId: item.productId,
      productName: product.name,
      unitPrice: product.price,
      quantity,
      notes: item.notes ?? null,
    });
    const subtotal = centsToAmount(snapshot.lineSubtotalCents);
    totalAmount += subtotal;
    enrichedItems.push({
      productId: snapshot.productId,
      productName: snapshot.productName,
      quantity: snapshot.quantity,
      unitPrice: centsToAmount(snapshot.unitPriceCents),
      subtotal,
      notes: snapshot.notes ?? null,
    });
  }
  return { enrichedItems, totalAmount: Math.round(totalAmount * 100) / 100 };
}

async function buildDbItemsWithClient(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  items: Array<{ productId: number; quantity: number; notes?: string | null }>,
) {
  let totalAmount = 0;
  const enrichedItems = [];
  for (const item of items) {
    const productResult = await client.query(
      "SELECT id, name, price FROM products WHERE id = $1 LIMIT 1",
      [item.productId],
    );
    const product = productResult.rows[0];
    if (!product) {
      throw Object.assign(new Error(`Product ${item.productId} not found`), {
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    }
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const snapshot = buildOrderItemSnapshot({
      productId: item.productId,
      productName: product.name,
      unitPrice: Number(product.price),
      quantity,
      notes: item.notes ?? null,
    });
    const subtotal = centsToAmount(snapshot.lineSubtotalCents);
    totalAmount += subtotal;
    enrichedItems.push({
      productId: snapshot.productId,
      productName: snapshot.productName,
      quantity: snapshot.quantity,
      unitPrice: centsToAmount(snapshot.unitPriceCents),
      subtotal,
      notes: snapshot.notes ?? null,
    });
  }
  return { enrichedItems, totalAmount: Math.round(totalAmount * 100) / 100 };
}

async function createDbOrderTransaction(input: {
  orderData: Omit<ReturnType<typeof CreateOrderBody.parse>, "items">;
  items: NormalizedOrderItemInput[];
  idempotencyKey: string | null;
  actor: ReturnType<typeof getRequestUser>;
}) {
  await ensureOrderSchema();
  await ensurePaymentSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.idempotencyKey) {
      const existing = await client.query(
        "SELECT id FROM orders WHERE idempotency_key = $1 LIMIT 1",
        [input.idempotencyKey],
      );
      if (existing.rows[0]?.id) {
        await client.query("COMMIT");
        return { order: await getDbOrder(Number(existing.rows[0].id)), replayed: true };
      }
    }

    const { enrichedItems, totalAmount } = await buildDbItemsWithClient(client, input.items);
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, table_id, type, status, payment_status, payment_method, paid_amount, total_amount, notes, idempotency_key)
       VALUES ($1, $2, $3, 'pending', 'unpaid', 'unpaid', 0, $4, $5, $6)
       RETURNING id`,
      [
        input.orderData.customerId ?? null,
        input.orderData.tableId ?? null,
        dbOrderType(input.orderData.type ?? "dine_in"),
        totalAmount,
        input.orderData.notes ?? null,
        input.idempotencyKey,
      ],
    );
    const orderId = Number(orderResult.rows[0].id);
    for (const item of enrichedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.productId, item.productName, item.quantity, item.unitPrice, item.subtotal, item.notes],
      );
    }

    if (input.orderData.tableId && dbOrderType(input.orderData.type ?? "dine_in") === "dine-in") {
      await client.query(
        "UPDATE tables SET status = 'occupied', updated_at = now() WHERE id = $1",
        [input.orderData.tableId],
      );
    }

    if (input.orderData.customerId) {
      await client.query(
        "INSERT INTO visits (customer_id, order_id, amount, order_type) VALUES ($1, $2, $3, $4)",
        [input.orderData.customerId, orderId, totalAmount, dbOrderType(input.orderData.type ?? "dine_in")],
      );
      await client.query(
        "UPDATE customers SET visit_count = visit_count + 1, total_spend = total_spend + $1 WHERE id = $2",
        [totalAmount, input.orderData.customerId],
      );
    }

    await writeAuditLog({
      actor: input.actor,
      action: "order.created",
      entityType: "order",
      entityId: orderId,
      after: { id: orderId, totalAmount, itemCount: enrichedItems.length, tableId: input.orderData.tableId ?? null },
      client,
    });

    await client.query("COMMIT");
    return { order: await getDbOrder(orderId), replayed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function syncTableAfterTerminalOrder(tableId: number | null | undefined) {
  if (!tableId) return;
  const active = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM orders WHERE table_id = $1 AND type = 'dine-in' AND status = ANY($2::text[])",
    [tableId, [...ACTIVE_DINE_IN_ORDER_STATUSES]],
  );
  if (Number(active.rows[0]?.count ?? 0) === 0) {
    await pool.query("UPDATE tables SET status = 'cleaning', updated_at = now() WHERE id = $1 AND status = 'occupied'", [tableId]);
  }
}

router.get("/orders", async (req, res, next): Promise<void> => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "ORDER_QUERY_INVALID", parsed.error.message);
    return;
  }
  const { status, type, date } = parsed.data;

  if (!isDatabaseConfigured()) {
    res.json(listRuntimeOrders({ status, type, date }));
    return;
  }

  try {
    await ensureOrderSchema();
    const conditions = [];
    if (status) conditions.push(eq(ordersTable.status, status));
    if (type) conditions.push(eq(ordersTable.type, type));
    if (date) {
      const startOfDay = new Date(`${date}T00:00:00Z`);
      const endOfDay = new Date(`${date}T23:59:59Z`);
      conditions.push(gte(ordersTable.createdAt, startOfDay));
      conditions.push(lte(ordersTable.createdAt, endOfDay));
    }

    const orders =
      conditions.length > 0
        ? await db
            .select()
            .from(ordersTable)
            .where(and(...conditions))
            .orderBy(sql`${ordersTable.createdAt} DESC`)
        : await db
            .select()
            .from(ordersTable)
            .orderBy(sql`${ordersTable.createdAt} DESC`);

    const enrichedOrders = await Promise.all(
      orders.map((order) =>
        attachResilientPaymentSummary(order, calculateOrderPaymentSummary),
      ),
    );
    res.json(enrichedOrders);
  } catch (error) {
    next(error);
  }
});


router.get("/orders/kds", async (_req, res, next): Promise<void> => {
  if (!isDatabaseConfigured()) {
    const orders = KDS_ACTIVE_ORDER_STATUSES.flatMap((status) => listRuntimeOrders({ status }));
    res.json({
      ok: true,
      sourceOfTruth: "backend-order-domain",
      activeStatuses: KDS_ACTIVE_ORDER_STATUSES,
      total: orders.length,
      columns: groupKdsOrdersByStatus(orders),
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    await ensureOrderSchema();
    const active = await pool.query<{ id: number }>(
      "SELECT id FROM orders WHERE status = ANY($1::text[]) ORDER BY created_at ASC",
      [[...KDS_ACTIVE_ORDER_STATUSES]],
    );
    const orders = (await Promise.all(active.rows.map((row) => getDbOrder(Number(row.id)))))
      .filter((order): order is NonNullable<Awaited<ReturnType<typeof getDbOrder>>> => Boolean(order));

    res.json({
      ok: true,
      sourceOfTruth: "backend-order-domain",
      activeStatuses: KDS_ACTIVE_ORDER_STATUSES,
      total: orders.length,
      columns: groupKdsOrdersByStatus(orders),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/orders", async (req, res, next): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "ORDER_CREATE_INVALID", parsed.error.message);
    return;
  }

  const { items, ...orderData } = parsed.data;
  let normalizedItems: NormalizedOrderItemInput[];
  try {
    normalizedItems = normalizeItems(items as unknown[]);
  } catch (error: any) {
    sendError(
      res,
      error?.statusCode ?? 400,
      "ORDER_ITEMS_INVALID",
      error?.message ?? "Invalid order items.",
    );
    return;
  }
  const idempotencyKey = getIdempotencyKey(req);
  if (!normalizedItems.length) {
    sendError(
      res,
      400,
      "ORDER_ITEMS_REQUIRED",
      "At least one order item is required.",
    );
    return;
  }

  if (!isDatabaseConfigured()) {
    const order = createRuntimeOrder({
      ...orderData,
      type: dbOrderType(orderData.type ?? "dine_in"),
      items: normalizedItems,
      idempotencyKey,
    });
    res.status(201).json(order);
    return;
  }

  try {
    const result = await createDbOrderTransaction({
      orderData,
      items: normalizedItems,
      idempotencyKey,
      actor: getRequestUser(req),
    });
    res.status(result.replayed ? 200 : 201).json(result.order);
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, error.code ?? "ORDER_CREATE_INVALID", error.message);
      return;
    }
    next(error);
  }
});

async function getDbOrder(id: number) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id));
  if (!order) return null;
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, order.id));
  const orderWithPaymentSummary = await attachResilientPaymentSummary(
    order,
    calculateOrderPaymentSummary,
  );
  return { ...orderWithPaymentSummary, items };
}


router.get("/orders/:id/payments", async (req, res, next): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "ORDER_ID_INVALID", params.error.message);
    return;
  }
  if (!isDatabaseConfigured()) {
    sendError(res, 503, "DATABASE_UNAVAILABLE", "Payment records require DATABASE_URL.");
    return;
  }
  try {
    await ensureOrderSchema();
    const order = await getDbOrder(params.data.id);
    if (!order) {
      sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
      return;
    }
    res.json(await getOrderPaymentBundle(params.data.id));
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:id/payments", async (req, res, next): Promise<void> => {
  const user = getRequestUser(req);
  if (!canAddPayment(user?.role)) {
    sendError(res, 403, "AUTH_FORBIDDEN", "You do not have permission to add payments.");
    return;
  }
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "ORDER_ID_INVALID", params.error.message);
    return;
  }
  const amount = Number(req.body?.amount);
  const method = String(req.body?.method ?? "") as PaymentMethod;
  if (!Number.isFinite(amount) || amount <= 0) {
    sendError(res, 400, "PAYMENT_AMOUNT_INVALID", "Payment amount must be greater than 0.");
    return;
  }
  if (!["cash", "card", "transfer", "external"].includes(method)) {
    sendError(res, 400, "PAYMENT_METHOD_INVALID", "Payment method must be cash, card, transfer, or external.");
    return;
  }
  if (!isDatabaseConfigured()) {
    sendError(res, 503, "DATABASE_UNAVAILABLE", "Payment records require DATABASE_URL.");
    return;
  }
  try {
    await ensureOrderSchema();
    const result = await addPayment({
      orderId: params.data.id,
      amount,
      method,
      note: typeof req.body?.note === "string" ? req.body.note : null,
      externalReference: typeof req.body?.externalReference === "string" ? req.body.externalReference : null,
      actor: user,
      idempotencyKey: getIdempotencyKey(req),
    });
    const order = await getDbOrder(params.data.id);
    res.status(201).json({ ...result, order });
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, error.code ?? "PAYMENT_CREATE_FAILED", error.message);
      return;
    }
    next(error);
  }
});

router.get("/orders/:id", async (req, res, next): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "ORDER_ID_INVALID", params.error.message);
    return;
  }

  if (!isDatabaseConfigured()) {
    const order = getRuntimeOrder(params.data.id);
    if (!order) sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
    else res.json(order);
    return;
  }

  try {
    await ensureOrderSchema();
    const order = await getDbOrder(params.data.id);
    if (!order) {
      sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
      return;
    }
    res.json(order);
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:id", async (req, res, next): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "ORDER_ID_INVALID", params.error.message);
    return;
  }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "ORDER_UPDATE_INVALID", parsed.error.message);
    return;
  }
  const normalized = normalizeUpdate(parsed.data as Record<string, unknown>);
  if ("message" in normalized) {
    sendError(res, 400, "ORDER_UPDATE_INVALID", normalized.message);
    return;
  }
  const { update, items } = normalized;

  if (!isDatabaseConfigured()) {
    const runtimePatch = items ? { ...update, items } : update;
    const order = updateRuntimeOrder(params.data.id, runtimePatch);
    if (!order) sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
    else res.json(order);
    return;
  }

  try {
    await ensureOrderSchema();
    const existing = await getDbOrder(params.data.id);
    if (!existing) {
      sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
      return;
    }

    if (typeof update.status === "string") {
      assertOrderTransition(existing.status, update.status);
      if (normalizeOrderStatus(update.status) === "cancelled") {
        const summary = await calculateOrderPaymentSummary(existing.id);
        const user = getRequestUser(req);
        if (summary.paidAmount > 0 && user?.role !== "admin" && user?.role !== "manager") {
          throw Object.assign(new Error("Only admin or manager can cancel a paid or partially paid order."), { statusCode: 403, code: "AUTH_FORBIDDEN" });
        }
      }
    }

    if (items) {
      const { enrichedItems, totalAmount } = await buildDbItems(items);
      await db
        .delete(orderItemsTable)
        .where(eq(orderItemsTable.orderId, params.data.id));
      await db
        .insert(orderItemsTable)
        .values(enrichedItems.map((i) => ({ ...i, orderId: params.data.id })));
      update.totalAmount = totalAmount;
    }


    const beforeAudit = { ...existing };
    const [order] = await db
      .update(ordersTable)
      .set(update)
      .where(eq(ordersTable.id, params.data.id))
      .returning();

    if (items || update.status === "cancelled" || update.status === "completed") {
      await syncOrderPaymentSummary(order.id, getRequestUser(req));
      if (update.status === "cancelled" || update.status === "completed") {
        await syncTableAfterTerminalOrder(existing.tableId);
      }
    }
    if (items || update.status === "cancelled" || update.status === "completed") {
      await writeAuditLog({
        actor: getRequestUser(req),
        action: items ? "order.items_updated" : update.status === "completed" ? "order.completed" : "order.cancelled",
        entityType: "order",
        entityId: order.id,
        before: beforeAudit,
        after: await getDbOrder(order.id),
      });
    }
    res.json(await getDbOrder(order.id));
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, error.code ?? "ORDER_UPDATE_INVALID", error.message);
      return;
    }
    next(error);
  }
});

export default router;
