import { Router, type IRouter, type Response } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  orderItemsTable,
  ordersTable,
  pool,
  productsTable,
  customersTable,
  visitsTable,
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
      orders.map(async (order) => {
        try {
          const summary = await calculateOrderPaymentSummary(order.id);
          return { ...order, ...summary };
        } catch {
          return { ...order, balance: Math.max(order.totalAmount - (order.paidAmount ?? 0), 0), paymentCount: 0 };
        }
      }),
    );
    res.json(enrichedOrders);
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
    await ensureOrderSchema();
    if (idempotencyKey) {
      const existing = await pool.query(
        "SELECT id FROM orders WHERE idempotency_key = $1 LIMIT 1",
        [idempotencyKey],
      );
      if (existing.rows[0]?.id) {
        const order = await getDbOrder(Number(existing.rows[0].id));
        res.status(200).json(order);
        return;
      }
    }

    const { enrichedItems, totalAmount } = await buildDbItems(normalizedItems);
    const [order] = await db
      .insert(ordersTable)
      .values({
        ...orderData,
        type: dbOrderType(orderData.type ?? "dine_in"),
        paymentStatus: "unpaid",
        paymentMethod: "unpaid",
        paidAmount: 0,
        totalAmount,
        idempotencyKey,
      })
      .returning();

    if (enrichedItems.length > 0) {
      await db
        .insert(orderItemsTable)
        .values(enrichedItems.map((i) => ({ ...i, orderId: order.id })));
    }

    if (orderData.customerId) {
      await db.insert(visitsTable).values({
        customerId: orderData.customerId,
        orderId: order.id,
        amount: totalAmount,
        orderType: dbOrderType(orderData.type ?? "dine_in"),
      });
      await db
        .update(customersTable)
        .set({
          visitCount: sql`${customersTable.visitCount} + 1`,
          totalSpend: sql`${customersTable.totalSpend} + ${totalAmount}`,
        })
        .where(eq(customersTable.id, orderData.customerId));
    }

    res.status(201).json(await getDbOrder(order.id));
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
  try {
    const paymentSummary = await calculateOrderPaymentSummary(order.id);
    return { ...order, ...paymentSummary, items };
  } catch {
    return { ...order, balance: Math.max(order.totalAmount - (order.paidAmount ?? 0), 0), paymentCount: 0, items };
  }
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

    if (items || update.status === "cancelled") {
      await syncOrderPaymentSummary(order.id, getRequestUser(req));
    }
    if (items || update.status === "cancelled") {
      await writeAuditLog({
        actor: getRequestUser(req),
        action: items ? "order.items_updated" : "order.cancelled",
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
