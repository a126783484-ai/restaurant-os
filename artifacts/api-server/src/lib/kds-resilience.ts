import { KDS_ACTIVE_ORDER_STATUSES } from "./order-domain-service";

export const KDS_DATA_QUALITY_CODES = [
  "ACTIVE_ORDER_WITHOUT_ITEMS",
  "ACTIVE_DINE_IN_WITHOUT_TABLE",
  "ACTIVE_ORDER_TABLE_NOT_OCCUPIED",
] as const;

export type KdsDataQualityCode = typeof KDS_DATA_QUALITY_CODES[number];

type DbOrderRow = Record<string, any>;
type DbOrderItemRow = Record<string, any>;

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function nullableIso(value: unknown): string | null {
  if (!value) return null;
  return toIso(value);
}

function roundMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function mapDbOrderItemRow(row: DbOrderItemRow) {
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    productId: Number(row.product_id),
    productName: String(row.product_name ?? ""),
    quantity: Number(row.quantity ?? 0),
    unitPrice: roundMoney(row.unit_price),
    subtotal: roundMoney(row.subtotal),
    notes: row.notes ?? null,
  };
}

export function detectKdsDataQualityIssue(order: DbOrderRow, items: DbOrderItemRow[]): {
  dataQualityIssue?: true;
  dataQualityCode?: KdsDataQualityCode;
  dataQualityMessage?: string;
} {
  if (items.length === 0) {
    return {
      dataQualityIssue: true,
      dataQualityCode: "ACTIVE_ORDER_WITHOUT_ITEMS",
      dataQualityMessage: "Active order has no order item snapshots.",
    };
  }

  if (String(order.type) === "dine-in" && order.table_id == null) {
    return {
      dataQualityIssue: true,
      dataQualityCode: "ACTIVE_DINE_IN_WITHOUT_TABLE",
      dataQualityMessage: "Active dine-in order does not reference a table.",
    };
  }

  if (String(order.type) === "dine-in" && (order.table_exists === false || order.table_status !== "occupied")) {
    return {
      dataQualityIssue: true,
      dataQualityCode: "ACTIVE_ORDER_TABLE_NOT_OCCUPIED",
      dataQualityMessage: order.table_exists === false
        ? "Active dine-in order references a missing table."
        : `Active dine-in order references a table with status ${String(order.table_status ?? "unknown")}.`,
    };
  }

  return {};
}

export function mapKdsDbOrderRow(order: DbOrderRow, items: DbOrderItemRow[] = []) {
  const totalAmount = roundMoney(order.total_amount);
  const paidAmount = roundMoney(order.paid_amount);
  return {
    id: Number(order.id),
    customerId: order.customer_id == null ? null : Number(order.customer_id),
    tableId: order.table_id == null ? null : Number(order.table_id),
    tableStatus: order.table_status ?? null,
    type: String(order.type ?? "dine-in"),
    status: String(order.status ?? "pending"),
    paymentStatus: String(order.payment_status ?? "unpaid"),
    paymentMethod: order.payment_method ?? null,
    paidAmount,
    totalAmount,
    balance: Math.max(roundMoney(totalAmount - paidAmount), 0),
    paymentCount: order.payment_count == null ? undefined : Number(order.payment_count),
    paymentNote: order.payment_note ?? null,
    paidAt: nullableIso(order.paid_at),
    notes: order.notes ?? null,
    createdAt: toIso(order.created_at),
    items: items.map(mapDbOrderItemRow),
    ...detectKdsDataQualityIssue(order, items),
  };
}

export async function listKdsDbOrders(queryable: Queryable) {
  const orderResult = await queryable.query(
    `SELECT o.id, o.customer_id, o.table_id, o.type, o.status, o.payment_status, o.payment_method,
            o.paid_amount, o.total_amount, o.payment_note, o.paid_at, o.notes, o.created_at,
            t.status AS table_status,
            (t.id IS NOT NULL) AS table_exists
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
      WHERE o.status = ANY($1::text[])
      ORDER BY o.created_at ASC`,
    [[...KDS_ACTIVE_ORDER_STATUSES]],
  );

  const orderIds = orderResult.rows.map((row) => Number(row.id));
  if (!orderIds.length) return [];

  const itemResult = await queryable.query(
    `SELECT id, order_id, product_id, product_name, quantity, unit_price, subtotal, notes, created_at
       FROM order_items
      WHERE order_id = ANY($1::int[])
      ORDER BY created_at ASC, id ASC`,
    [orderIds],
  );
  const itemsByOrderId = new Map<number, DbOrderItemRow[]>();
  for (const item of itemResult.rows) {
    const orderId = Number(item.order_id);
    const current = itemsByOrderId.get(orderId) ?? [];
    current.push(item);
    itemsByOrderId.set(orderId, current);
  }

  return orderResult.rows.map((order) => mapKdsDbOrderRow(order, itemsByOrderId.get(Number(order.id)) ?? []));
}
