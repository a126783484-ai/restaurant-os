import { Router, type IRouter, type Response } from "express";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  isDatabaseUnavailableError,
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
import { listKdsDbOrders } from "../lib/kds-resilience";
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

type Queryable = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

function roundMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

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

async function syncTableAfterTerminalOrderWithClient(
  client: Queryable,
  tableId: number | null | undefined,
) {
  if (!tableId) return;
  const active = await client.query(
    "SELECT COUNT(*)::int AS count FROM orders WHERE table_id = $1 AND type = 'dine-in' AND status = ANY($2::text[])",
    [tableId, [...ACTIVE_DINE_IN_ORDER_STATUSES]],
  );
  if (Number(active.rows[0]?.count ?? 0) === 0) {
    await client.query(
      "UPDATE tables SET status = 'cleaning', updated_at = now() WHERE id = $1 AND status = 'occupied'",
      [tableId],
    );
  }
}

async function writeOperationalAuditLog(
  input: Parameters<typeof writeAuditLog>[0],
): Promise<void> {
  const client = input.client as Queryable | undefined;
  try {
    if (client) await client.query("SAVEPOINT order_status_audit");
    await writeAuditLog(input);
    if (client) await client.query("RELEASE SAVEPOINT order_status_audit");
  } catch (error) {
    if (client)
      await client
        .query("ROLLBACK TO SAVEPOINT order_status_audit")
        .catch(() => undefined);
    console.error("[orders] audit log write failed during status update", {
      action: input.action,
      entityId: input.entityId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getDbOrderWithClient(client: Queryable, id: number) {
  const orderResult = await client.query(
    `SELECT id, customer_id, table_id, type, status, payment_status, payment_method, paid_amount,
            total_amount, payment_note, paid_at, notes, created_at
       FROM orders
      WHERE id = $1`,
    [id],
  );
  const order = orderResult.rows[0];
  if (!order) return null;
  const itemResult = await client.query(
    `SELECT id, order_id, product_id, product_name, quantity, unit_price, subtotal, notes
       FROM order_items
      WHERE order_id = $1
      ORDER BY created_at ASC, id ASC`,
    [id],
  );
  const totalAmount = roundMoney(order.total_amount);
  const paidAmount = roundMoney(order.paid_amount);
  return {
    id: Number(order.id),
    customerId: order.customer_id == null ? null : Number(order.customer_id),
    tableId: order.table_id == null ? null : Number(order.table_id),
    type: String(order.type ?? "dine-in"),
    status: String(order.status ?? "pending"),
    paymentStatus: String(order.payment_status ?? "unpaid"),
    paymentMethod: order.payment_method ?? null,
    paidAmount,
    totalAmount,
    balance: Math.max(roundMoney(totalAmount - paidAmount), 0),
    paymentNote: order.payment_note ?? null,
    paidAt: order.paid_at
      ? order.paid_at instanceof Date
        ? order.paid_at.toISOString()
        : new Date(String(order.paid_at)).toISOString()
      : null,
    notes: order.notes ?? null,
    createdAt:
      order.created_at instanceof Date
        ? order.created_at.toISOString()
        : new Date(String(order.created_at)).toISOString(),
    items: itemResult.rows.map((item) => ({
      id: Number(item.id),
      orderId: Number(item.order_id),
      productId: Number(item.product_id),
      productName: String(item.product_name ?? ""),
      quantity: Number(item.quantity ?? 0),
      unitPrice: roundMoney(item.unit_price),
      subtotal: roundMoney(item.subtotal),
      notes: item.notes ?? null,
    })),
  };
}

async function updateDbOrderStatusOnly(input: {
  id: number;
  status: string;
  actor: ReturnType<typeof getRequestUser>;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingResult = await client.query(
      `SELECT id, table_id, status
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [input.id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      throw Object.assign(new Error("Order not found."), {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    assertOrderTransition(existing.status, input.status);

    await client.query(
      `UPDATE orders
          SET status = $1, updated_at = now()
        WHERE id = $2`,
      [input.status, input.id],
    );

    if (input.status === "completed") {
      await syncTableAfterTerminalOrderWithClient(
        client,
        existing.table_id == null ? null : Number(existing.table_id),
      );
    }

    const updated = await getDbOrderWithClient(client, input.id);
    if (!updated) {
      throw Object.assign(new Error("Order not found after update."), {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    await writeOperationalAuditLog({
      actor: input.actor,
      action:
        input.status === "completed"
          ? "order.completed"
          : "order.status_updated",
      entityType: "order",
      entityId: input.id,
      before: {
        id: Number(existing.id),
        status: String(existing.status),
        tableId: existing.table_id == null ? null : Number(existing.table_id),
      },
      after: updated,
      client,
    });

    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
    return {
      ok: false,
      message: "Payment status is derived from the payment ledger.",
    };
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
    return {
      ok: false,
      message: "Paid amount is derived from the payment ledger.",
    };
  }
  if (data.totalAmount !== undefined) {
    return {
      ok: false,
      message: "Order total is derived from item price snapshots.",
    };
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
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await db
    .select()
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  const productMap = new Map(products.map((p) => [p.id, p]));

  let totalAmount = 0;
  const enrichedItems = [];
  for (const item of items) {
    const product = productMap.get(item.productId);
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
  client: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  },
  items: Array<{ productId: number; quantity: number; notes?: string | null }>,
) {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const productResult = await client.query(
    "SELECT id, name, price FROM products WHERE id = ANY($1::int[])",
    [productIds],
  );
  const productMap = new Map<
    number,
    { id: number; name: string; price: number }
  >(
    productResult.rows.map((p) => [
      Number(p.id),
      { id: Number(p.id), name: p.name, price: Number(p.price) },
    ]),
  );

  let totalAmount = 0;
  const enrichedItems = [];
  for (const item of items) {
    const product = productMap.get(item.productId);
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
    const orderType = dbOrderType(input.orderData.type ?? "dine_in");
    const tableId = input.orderData.tableId ?? null;

    if (input.idempotencyKey) {
      const existing = await client.query(
        "SELECT id FROM orders WHERE idempotency_key = $1 LIMIT 1",
        [input.idempotencyKey],
      );
      if (existing.rows[0]?.id) {
        const order = await getDbOrderWithClient(
          client,
          Number(existing.rows[0].id),
        );
        if (!order) {
          throw Object.assign(
            new Error("Order not found after idempotent replay."),
            {
              statusCode: 404,
              code: "ORDER_NOT_FOUND",
            },
          );
        }
        await client.query("COMMIT");
        return { order, replayed: true };
      }
    }

    if (orderType === "dine-in" && !tableId) {
      throw Object.assign(new Error("Dine-in orders require a valid table."), {
        statusCode: 400,
        code: "ORDER_TABLE_REQUIRED",
      });
    }

    if (orderType === "dine-in" && tableId) {
      const tableResult = await client.query(
        "SELECT id FROM tables WHERE id = $1 FOR UPDATE",
        [tableId],
      );
      if (!tableResult.rows[0]?.id) {
        throw Object.assign(new Error("Selected table was not found."), {
          statusCode: 404,
          code: "TABLE_NOT_FOUND",
        });
      }
    }

    const { enrichedItems, totalAmount } = await buildDbItemsWithClient(
      client,
      input.items,
    );
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, table_id, type, status, payment_status, payment_method, paid_amount, total_amount, notes, idempotency_key)
       VALUES ($1, $2, $3, 'pending', 'unpaid', 'unpaid', 0, $4, $5, $6)
      RETURNING id`,
      [
        input.orderData.customerId ?? null,
        tableId,
        orderType,
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
        [
          orderId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.subtotal,
          item.notes,
        ],
      );
    }

    if (tableId && orderType === "dine-in") {
      const tableUpdate = await client.query(
        "UPDATE tables SET status = 'occupied', updated_at = now() WHERE id = $1",
        [tableId],
      );
      if (tableUpdate.rowCount !== 1) {
        throw Object.assign(
          new Error("Selected table could not be marked occupied."),
          { statusCode: 409, code: "TABLE_STATUS_SYNC_FAILED" },
        );
      }
    }

    if (input.orderData.customerId) {
      await client.query(
        "INSERT INTO visits (customer_id, order_id, amount, order_type) VALUES ($1, $2, $3, $4)",
        [input.orderData.customerId, orderId, totalAmount, orderType],
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
      after: {
        id: orderId,
        totalAmount,
        itemCount: enrichedItems.length,
        tableId,
      },
      client,
    });

    const order = await getDbOrderWithClient(client, orderId);
    if (!order) {
      throw Object.assign(new Error("Order not found after create."), {
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
      });
    }

    await client.query("COMMIT");
    return { order, replayed: false };
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
    await pool.query(
      "UPDATE tables SET status = 'cleaning', updated_at = now() WHERE id = $1 AND status = 'occupied'",
      [tableId],
    );
  }
}

async function batchFetchPaymentSummaries(
  orderIds: number[],
): Promise<
  Map<
    number,
    { chargeAmount: number; refundAmount: number; paymentCount: number }
  >
> {
  if (orderIds.length === 0) return new Map();
  const result = await pool.query(
    `SELECT
       order_id,
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'),     0)::float AS charge_amount,
       COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::float AS refund_amount,
       COUNT(*)::int AS payment_count
     FROM payments
     WHERE order_id = ANY($1::int[])
     GROUP BY order_id`,
    [orderIds],
  );
  const map = new Map<
    number,
    { chargeAmount: number; refundAmount: number; paymentCount: number }
  >();
  for (const row of result.rows) {
    map.set(Number(row.order_id), {
      chargeAmount: Number(row.charge_amount),
      refundAmount: Number(row.refund_amount),
      paymentCount: Number(row.payment_count),
    });
  }
  return map;
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

    if (orders.length === 0) {
      res.json([]);
      return;
    }

    const orderIds = orders.map((order) => order.id);
    let paymentMap = new Map<
      number,
      { chargeAmount: number; refundAmount: number; paymentCount: number }
    >();
    let paymentSummaryUnavailable = false;

    try {
      paymentMap = await batchFetchPaymentSummaries(orderIds);
    } catch (paymentError) {
      paymentSummaryUnavailable = true;
      console.error(
        "[orders] batch payment summary failed, using order-level fallback",
        paymentError,
      );
    }

    const enrichedOrders = orders.map((order) => {
      const totalAmount = roundMoney(order.totalAmount ?? 0);

      if (paymentSummaryUnavailable) {
        const paidAmount = roundMoney(order.paidAmount ?? 0);
        return {
          ...order,
          paidAmount,
          balance: Math.max(roundMoney(totalAmount - paidAmount), 0),
          paymentStatus: order.paymentStatus ?? "unpaid",
          paymentCount: 0,
          paymentSummaryUnavailable: true,
          paymentSummaryErrorCode: "PAYMENT_SUMMARY_UNAVAILABLE",
          paymentSummaryErrorMessage:
            "Payment summary could not be calculated for this order.",
        };
      }

      const paymentSummary = paymentMap.get(order.id);
      const netPaid = paymentSummary
        ? Math.max(
            roundMoney(
              paymentSummary.chargeAmount - paymentSummary.refundAmount,
            ),
            0,
          )
        : 0;
      const balance = Math.max(roundMoney(totalAmount - netPaid), 0);

      let paymentStatus: string;
      const hasRefund = (paymentSummary?.refundAmount ?? 0) > 0;
      if (order.status === "cancelled") {
        paymentStatus =
          netPaid === 0
            ? "cancelled"
            : hasRefund
              ? "refunded"
              : "partially_paid";
      } else if (netPaid === 0) {
        paymentStatus = hasRefund ? "refunded" : "unpaid";
      } else if (balance > 0) {
        paymentStatus = "partially_paid";
      } else {
        paymentStatus = "paid";
      }

      return {
        ...order,
        paidAmount: netPaid,
        balance,
        paymentStatus,
        paymentCount: paymentSummary?.paymentCount ?? 0,
        paymentSummaryUnavailable: false,
      };
    });

    res.json(enrichedOrders);
  } catch (error) {
    next(error);
  }
});

router.get("/orders/kds", async (_req, res, next): Promise<void> => {
  if (!isDatabaseConfigured()) {
    const orders = KDS_ACTIVE_ORDER_STATUSES.flatMap((status) =>
      listRuntimeOrders({ status }),
    );
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
    const orders = await listKdsDbOrders(pool);

    res.json({
      ok: true,
      sourceOfTruth: "backend-order-domain",
      activeStatuses: KDS_ACTIVE_ORDER_STATUSES,
      total: orders.length,
      columns: groupKdsOrdersByStatus(orders),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      const message =
        error instanceof Error
          ? error.message
          : "Database unavailable while loading KDS board.";
      res.status(503).json({
        ok: false,
        sourceOfTruth: "backend-order-domain",
        activeStatuses: KDS_ACTIVE_ORDER_STATUSES,
        total: 0,
        columns: groupKdsOrdersByStatus([]),
        generatedAt: new Date().toISOString(),
        degraded: true,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message,
        },
      });
      return;
    }

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
      sendError(
        res,
        error.statusCode,
        error.code ?? "ORDER_CREATE_INVALID",
        error.message,
      );
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
    sendError(
      res,
      503,
      "DATABASE_UNAVAILABLE",
      "Payment records require DATABASE_URL.",
    );
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
    sendError(
      res,
      403,
      "AUTH_FORBIDDEN",
      "You do not have permission to add payments.",
    );
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
    sendError(
      res,
      400,
      "PAYMENT_AMOUNT_INVALID",
      "Payment amount must be greater than 0.",
    );
    return;
  }
  if (!["cash", "card", "transfer", "external"].includes(method)) {
    sendError(
      res,
      400,
      "PAYMENT_METHOD_INVALID",
      "Payment method must be cash, card, transfer, or external.",
    );
    return;
  }
  if (!isDatabaseConfigured()) {
    sendError(
      res,
      503,
      "DATABASE_UNAVAILABLE",
      "Payment records require DATABASE_URL.",
    );
    return;
  }
  try {
    await ensureOrderSchema();
    const result = await addPayment({
      orderId: params.data.id,
      amount,
      method,
      note: typeof req.body?.note === "string" ? req.body.note : null,
      externalReference:
        typeof req.body?.externalReference === "string"
          ? req.body.externalReference
          : null,
      actor: user,
      idempotencyKey: getIdempotencyKey(req),
    });
    const order = await getDbOrder(params.data.id);
    res.status(201).json({ ...result, order });
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(
        res,
        error.statusCode,
        error.code ?? "PAYMENT_CREATE_FAILED",
        error.message,
      );
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
    const updateKeys = Object.keys(update);
    if (
      !items &&
      updateKeys.length === 1 &&
      typeof update.status === "string" &&
      normalizeOrderStatus(update.status) !== "completed" &&
      normalizeOrderStatus(update.status) !== "cancelled"
    ) {
      const order = await updateDbOrderStatusOnly({
        id: params.data.id,
        status: update.status,
        actor: getRequestUser(req),
      });
      res.json(order);
      return;
    }

    const existing = await getDbOrder(params.data.id);
    if (!existing) {
      sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
      return;
    }

    const actor = getRequestUser(req);
    const statusBecomesTerminal =
      typeof update.status === "string" &&
      existing.status !== update.status &&
      (normalizeOrderStatus(update.status) === "completed" ||
        normalizeOrderStatus(update.status) === "cancelled");

    if (typeof update.status === "string") {
      assertOrderTransition(existing.status, update.status);
      if (normalizeOrderStatus(update.status) === "cancelled") {
        const summary = await calculateOrderPaymentSummary(existing.id);
        const user = getRequestUser(req);
        if (
          summary.paidAmount > 0 &&
          user?.role !== "admin" &&
          user?.role !== "manager"
        ) {
          throw Object.assign(
            new Error(
              "Only admin or manager can cancel a paid or partially paid order.",
            ),
            { statusCode: 403, code: "AUTH_FORBIDDEN" },
          );
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

    if (!order) {
      sendError(res, 404, "ORDER_NOT_FOUND", "Order not found.");
      return;
    }
    const normalizedUpdatedStatus =
      typeof update.status === "string"
        ? normalizeOrderStatus(update.status)
        : undefined;

    if (
      normalizedUpdatedStatus === "completed" ||
      normalizedUpdatedStatus === "cancelled"
    ) {
      await syncTableAfterTerminalOrder(existing.tableId);
    }
    if (items || statusBecomesTerminal) {
      await syncOrderPaymentSummary(order.id, actor);
    }
    const updated = await getDbOrder(order.id);
    if (
      items ||
      normalizedUpdatedStatus === "completed" ||
      normalizedUpdatedStatus === "cancelled"
    ) {
      const action = items
        ? "order.items_updated"
        : normalizedUpdatedStatus === "completed"
          ? "order.completed"
          : "order.cancelled";
      await writeAuditLog({
        actor,
        action,
        entityType: "order",
        entityId: order.id,
        before: beforeAudit,
        after: updated ?? order,
      });
    }
    res.json(updated ?? order);
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(
        res,
        error.statusCode,
        error.code ?? "ORDER_UPDATE_INVALID",
        error.message,
      );
      return;
    }
    next(error);
  }
});

export default router;
