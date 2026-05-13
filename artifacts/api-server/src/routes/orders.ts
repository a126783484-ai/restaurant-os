import { Router, type IRouter, type Response } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, isDatabaseConfigured, orderItemsTable, ordersTable, pool, productsTable, customersTable, visitsTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
} from "@workspace/api-zod";
import { createRuntimeOrder, getRuntimeOrder, listRuntimeOrders, updateRuntimeOrder } from "../lib/one-store-runtime";

const router: IRouter = Router();
const VALID_STATUSES = new Set(["pending", "preparing", "ready", "completed", "cancelled"]);
const VALID_PAYMENT_STATUSES = new Set(["unpaid", "partially_paid", "paid", "refunded", "cancelled"]);
const VALID_PAYMENT_METHODS = new Set(["unpaid", "cash", "card", "transfer", "external"]);
let orderSchemaReady: Promise<void> | null = null;

function sendError(res: Response, status: number, code: string, message: string): void {
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
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount REAL NOT NULL DEFAULT 0");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_note TEXT");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders (idempotency_key)");
  })();
  await orderSchemaReady;
}

function getIdempotencyKey(req: Parameters<IRouter["post"]>[1] extends (...args: infer A) => any ? A[0] : any): string | null {
  const header = req.header("x-idempotency-key");
  const bodyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : null;
  const key = (header ?? bodyKey)?.trim();
  return key || null;
}

function normalizeUpdate(data: Record<string, unknown>): Record<string, unknown> | null {
  const update: Record<string, unknown> = {};
  if (typeof data.status === "string") {
    if (!VALID_STATUSES.has(data.status)) return null;
    update.status = data.status;
  }
  if (typeof data.paymentStatus === "string") {
    if (!VALID_PAYMENT_STATUSES.has(data.paymentStatus)) return null;
    update.paymentStatus = data.paymentStatus;
    if (data.paymentStatus === "paid" && !data.paidAt) update.paidAt = new Date().toISOString();
    if (data.paymentStatus === "unpaid") update.paidAmount = 0;
  }
  if (typeof data.paymentMethod === "string") {
    if (!VALID_PAYMENT_METHODS.has(data.paymentMethod)) return null;
    update.paymentMethod = data.paymentMethod;
  }
  if (typeof data.notes === "string" || data.notes === null) update.notes = data.notes;
  if (typeof data.paymentNote === "string" || data.paymentNote === null) update.paymentNote = data.paymentNote;
  if (typeof data.paidAmount === "number") update.paidAmount = Math.max(0, data.paidAmount);
  if (typeof data.totalAmount === "number") update.totalAmount = Math.max(0, data.totalAmount);
  if (typeof data.paidAt === "string") update.paidAt = new Date(data.paidAt).toISOString();
  if (data.paidAt === null) update.paidAt = null;
  if (Array.isArray(data.items)) update.items = data.items;
  return update;
}

async function buildDbItems(items: Array<{ productId: number; quantity: number; notes?: string | null }>) {
  let totalAmount = 0;
  const enrichedItems = [];
  for (const item of items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { statusCode: 400 });
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const subtotal = Math.round(product.price * quantity * 100) / 100;
    totalAmount += subtotal;
    enrichedItems.push({
      productId: item.productId,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      subtotal,
      notes: item.notes ?? null,
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

    const orders = conditions.length > 0
      ? await db.select().from(ordersTable).where(and(...conditions)).orderBy(sql`${ordersTable.createdAt} DESC`)
      : await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} DESC`);

    res.json(orders);
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
  const normalizedItems = items as Array<{ productId: number; quantity: number; notes?: string | null }>;
  const idempotencyKey = getIdempotencyKey(req);
  if (!normalizedItems.length) {
    sendError(res, 400, "ORDER_ITEMS_REQUIRED", "At least one order item is required.");
    return;
  }

  if (!isDatabaseConfigured()) {
    const order = createRuntimeOrder({ ...orderData, type: orderData.type ?? "dine-in", items: normalizedItems, idempotencyKey });
    res.status(201).json(order);
    return;
  }

  try {
    await ensureOrderSchema();
    if (idempotencyKey) {
      const existing = await pool.query("SELECT id FROM orders WHERE idempotency_key = $1 LIMIT 1", [idempotencyKey]);
      if (existing.rows[0]?.id) {
        const order = await getDbOrder(Number(existing.rows[0].id));
        res.status(200).json(order);
        return;
      }
    }

    const { enrichedItems, totalAmount } = await buildDbItems(normalizedItems);
    const [order] = await db.insert(ordersTable).values({
      ...orderData,
      type: orderData.type ?? "dine-in",
      paymentStatus: "unpaid",
      paymentMethod: "unpaid",
      paidAmount: 0,
      totalAmount,
      idempotencyKey,
    }).returning();

    if (enrichedItems.length > 0) {
      await db.insert(orderItemsTable).values(enrichedItems.map(i => ({ ...i, orderId: order.id })));
    }

    if (orderData.customerId) {
      await db.insert(visitsTable).values({
        customerId: orderData.customerId,
        orderId: order.id,
        amount: totalAmount,
        orderType: orderData.type ?? "dine-in",
      });
      await db.update(customersTable)
        .set({
          visitCount: sql`${customersTable.visitCount} + 1`,
          totalSpend: sql`${customersTable.totalSpend} + ${totalAmount}`,
        })
        .where(eq(customersTable.id, orderData.customerId));
    }

    res.status(201).json(await getDbOrder(order.id));
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, "ORDER_CREATE_INVALID", error.message);
      return;
    }
    next(error);
  }
});

async function getDbOrder(id: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return null;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  return { ...order, items };
}

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
  const update = normalizeUpdate(parsed.data as Record<string, unknown>);
  if (!update) {
    sendError(res, 400, "ORDER_UPDATE_INVALID", "Invalid order status or payment value.");
    return;
  }

  if (!isDatabaseConfigured()) {
    const order = updateRuntimeOrder(params.data.id, update);
    if (!order) sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
    else res.json(order);
    return;
  }

  try {
    await ensureOrderSchema();
    if (Array.isArray(update.items)) {
      const { enrichedItems, totalAmount } = await buildDbItems(update.items as Array<{ productId: number; quantity: number; notes?: string | null }>);
      await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, params.data.id));
      if (enrichedItems.length > 0) {
        await db.insert(orderItemsTable).values(enrichedItems.map(i => ({ ...i, orderId: params.data.id })));
      }
      update.totalAmount = totalAmount;
      delete update.items;
    }

    const [order] = await db.update(ordersTable).set(update).where(eq(ordersTable.id, params.data.id)).returning();
    if (!order) {
      sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
      return;
    }
    res.json(await getDbOrder(order.id));
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, "ORDER_UPDATE_INVALID", error.message);
      return;
    }
    next(error);
  }
});

export default router;
