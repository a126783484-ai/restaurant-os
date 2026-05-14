import { pool } from "@workspace/db";
import { centsToAmount, deriveLedgerSummary, toCents } from "./v3-core";
import { ensurePaymentSchema } from "./payment-service";
import { ACTIVE_DINE_IN_ORDER_STATUSES, KDS_ACTIVE_ORDER_STATUSES } from "./order-domain-service";

export type ConsistencyDrift = {
  code: string;
  entityType: string;
  entityId: string | number;
  expected: number | string;
  actual: number | string;
  message: string;
};

export type ConsistencyReport = {
  ok: boolean;
  checkedAt: string;
  drifts: ConsistencyDrift[];
  summary: {
    driftCount: number;
    byCode: Record<string, number>;
  };
};

const VALID_ORDER_STATUSES = ["pending", "preparing", "ready", "completed", "cancelled"];
const VALID_ORDER_TYPES = ["dine-in", "takeout"];

export function detectOrderMoneyDrift(input: {
  orderId: number;
  orderStatus: string;
  orderTotal: number;
  itemSubtotal: number;
  orderPaid: number;
  chargeAmount: number;
  refundAmount: number;
}) {
  const drifts: ConsistencyDrift[] = [];
  const orderTotalCents = toCents(input.orderTotal);
  const itemSubtotalCents = toCents(input.itemSubtotal);
  const orderPaidCents = toCents(input.orderPaid);
  const netPaidCents = Math.max(toCents(input.chargeAmount) - toCents(input.refundAmount), 0);

  if (orderTotalCents !== itemSubtotalCents) {
    drifts.push({
      code: "ORDER_TOTAL_DRIFT",
      entityType: "order",
      entityId: input.orderId,
      expected: centsToAmount(itemSubtotalCents),
      actual: centsToAmount(orderTotalCents),
      message: "Order total does not match order item snapshot subtotal sum.",
    });
  }
  if (orderPaidCents !== netPaidCents) {
    drifts.push({
      code: "ORDER_PAID_LEDGER_DRIFT",
      entityType: "order",
      entityId: input.orderId,
      expected: centsToAmount(netPaidCents),
      actual: centsToAmount(orderPaidCents),
      message: "Order paid amount does not match payment ledger net paid amount.",
    });
  }
  if (input.orderStatus === "cancelled" && netPaidCents > 0) {
    drifts.push({
      code: "CANCELLED_ORDER_HAS_NET_PAID",
      entityType: "order",
      entityId: input.orderId,
      expected: 0,
      actual: centsToAmount(netPaidCents),
      message: "Cancelled order has net paid amount and must be reviewed for refund state.",
    });
  }
  return drifts;
}

async function pushRows(
  drifts: ConsistencyDrift[],
  query: string,
  params: unknown[],
  map: (row: Record<string, any>) => ConsistencyDrift,
): Promise<void> {
  const result = await pool.query(query, params);
  drifts.push(...result.rows.map(map));
}

export async function getConsistencyReport(): Promise<ConsistencyReport> {
  await ensurePaymentSchema();
  const drifts: ConsistencyDrift[] = [];
  const orders = await pool.query(
    `SELECT o.id,
            o.status,
            o.type,
            o.total_amount,
            o.paid_amount,
            o.payment_status,
            o.table_id,
            t.status AS table_status,
            COALESCE(items.item_count, 0)::int AS item_count,
            COALESCE(items.item_subtotal, 0)::float AS item_subtotal,
            COALESCE(payments.charge_amount, 0)::float AS charge_amount,
            COALESCE(payments.refund_amount, 0)::float AS refund_amount,
            COALESCE(payments.void_amount, 0)::float AS void_amount,
            COALESCE(payments.payment_count, 0)::int AS payment_count
     FROM orders o
     LEFT JOIN tables t ON t.id = o.table_id
     LEFT JOIN (
       SELECT order_id, COUNT(*)::int AS item_count, SUM(subtotal)::float AS item_subtotal
       FROM order_items
       GROUP BY order_id
     ) items ON items.order_id = o.id
     LEFT JOIN (
       SELECT order_id,
              SUM(amount) FILTER (WHERE status = 'paid')::float AS charge_amount,
              SUM(amount) FILTER (WHERE status = 'refunded')::float AS refund_amount,
              SUM(amount) FILTER (WHERE status = 'cancelled')::float AS void_amount,
              COUNT(*)::int AS payment_count
       FROM payments
       GROUP BY order_id
     ) payments ON payments.order_id = o.id
     ORDER BY o.id DESC
     LIMIT 500`,
  );

  for (const row of orders.rows) {
    const orderId = Number(row.id);
    if (!VALID_ORDER_STATUSES.includes(String(row.status))) {
      drifts.push({ code: "INVALID_ORDER_STATUS", entityType: "order", entityId: orderId, expected: VALID_ORDER_STATUSES.join(","), actual: String(row.status), message: "Order status is outside the supported production status set." });
    }
    if (!VALID_ORDER_TYPES.includes(String(row.type))) {
      drifts.push({ code: "INVALID_ORDER_TYPE", entityType: "order", entityId: orderId, expected: VALID_ORDER_TYPES.join(","), actual: String(row.type), message: "Order type is outside the supported production type set." });
    }
    const status = String(row.status);
    const type = String(row.type);
    const itemCount = Number(row.item_count ?? 0);
    const chargeAmount = Number(row.charge_amount ?? 0);
    const refundAmount = Number(row.refund_amount ?? 0);
    const voidAmount = Number(row.void_amount ?? 0);
    const ledger = deriveLedgerSummary({
      orderStatus: status,
      orderTotalCents: toCents(Number(row.total_amount ?? 0)),
      events: [
        { type: "payment", amountCents: toCents(chargeAmount), status: "valid" },
        { type: "refund", amountCents: toCents(refundAmount), status: "refunded" },
        { type: "void", amountCents: toCents(voidAmount), status: "voided" },
      ],
    });
    const netPaid = centsToAmount(ledger.netPaidCents);
    const isActive = (KDS_ACTIVE_ORDER_STATUSES as readonly string[]).includes(status);

    if (itemCount === 0) {
      drifts.push({ code: "ORDER_WITHOUT_ITEMS", entityType: "order", entityId: orderId, expected: "at least 1 order_item", actual: "0 order_items", message: "Order has no order_items rows." });
      if (isActive) {
        drifts.push({ code: "ACTIVE_ORDER_WITHOUT_ITEMS", entityType: "order", entityId: orderId, expected: "active order has item snapshots", actual: "0 order_items", message: "Active KDS order has no item snapshots and should be shown with a warning." });
      }
      if (Number(row.payment_count ?? 0) > 0) {
        drifts.push({ code: "LEDGER_PAYMENTS_WITHOUT_ITEM_SNAPSHOTS", entityType: "order", entityId: orderId, expected: "payments with item snapshots", actual: "payments exist and 0 order_items", message: "Payment ledger exists for an order with no item snapshots." });
      }
    }
    if (isActive && type === "dine-in" && row.table_id == null) {
      drifts.push({ code: "ACTIVE_DINE_IN_WITHOUT_TABLE", entityType: "order", entityId: orderId, expected: "active dine-in order references an occupied table", actual: "no table_id", message: "Active dine-in KDS order does not reference a table." });
    }
    if (isActive && type === "dine-in" && row.table_id != null && String(row.table_status) !== "occupied") {
      drifts.push({ code: "ACTIVE_ORDER_TABLE_NOT_OCCUPIED", entityType: "order", entityId: orderId, expected: "occupied table", actual: String(row.table_status ?? "missing"), message: "Active dine-in KDS order references a table that is not occupied." });
    }

    drifts.push(...detectOrderMoneyDrift({
      orderId,
      orderStatus: status,
      orderTotal: Number(row.total_amount ?? 0),
      itemSubtotal: Number(row.item_subtotal ?? 0),
      orderPaid: Number(row.paid_amount ?? 0),
      chargeAmount,
      refundAmount,
    }));
    if (String(row.payment_status) !== ledger.paymentStatus) {
      drifts.push({ code: "ORDER_PAYMENT_STATUS_LEDGER_DRIFT", entityType: "order", entityId: orderId, expected: ledger.paymentStatus, actual: String(row.payment_status), message: "Order payment_status does not match the payments ledger-derived status." });
    }
    if (String(row.payment_status) === "paid" && ledger.netPaidCents < toCents(Number(row.total_amount ?? 0))) {
      drifts.push({ code: "RECEIPT_ORDER_PAYMENT_MISMATCH", entityType: "order", entityId: orderId, expected: `net paid >= total (${row.total_amount ?? 0})`, actual: `net paid ${netPaid}`, message: "Order is marked paid but payment ledger does not cover the total; receipt totals may be inconsistent." });
    }
    if (isActive && String(row.payment_status) === "paid" && ledger.netPaidCents === 0) {
      drifts.push({ code: "ACTIVE_PAID_ORDER_WITHOUT_LEDGER_PAYMENT", entityType: "order", entityId: orderId, expected: "active paid order has net paid ledger", actual: "payment_status paid with net paid 0", message: "Active order is marked paid but has no effective ledger payment." });
    }
    if (isActive && String(row.payment_status) === "unpaid" && ledger.netPaidCents > 0) {
      drifts.push({ code: "ACTIVE_UNPAID_ORDER_WITH_LEDGER_PAYMENT", entityType: "order", entityId: orderId, expected: "active unpaid order has no net paid ledger", actual: `net paid ${netPaid}`, message: "Active order is marked unpaid but has effective ledger payment." });
    }
  }

  await pushRows(
    drifts,
    `SELECT p.id, p.order_id FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE o.id IS NULL ORDER BY p.id DESC LIMIT 200`,
    [],
    (row) => ({ code: "PAYMENT_MISSING_ORDER", entityType: "payment", entityId: Number(row.id), expected: `order ${row.order_id} exists`, actual: "missing order", message: "Payment references an order id that does not exist." }),
  );

  await pushRows(
    drifts,
    `SELECT t.id, t.status FROM tables t
     LEFT JOIN orders o ON o.table_id = t.id AND o.type = 'dine-in' AND o.status = ANY($1::text[])
     WHERE t.status = 'occupied' AND o.id IS NULL
     ORDER BY t.id LIMIT 200`,
    [[...ACTIVE_DINE_IN_ORDER_STATUSES]],
    (row) => ({ code: "OCCUPIED_TABLE_WITHOUT_ACTIVE_ORDER", entityType: "table", entityId: Number(row.id), expected: "active dine-in order", actual: String(row.status), message: "Table is occupied but no active dine-in order references it." }),
  );

  const byCode = drifts.reduce<Record<string, number>>((acc, drift) => {
    acc[drift.code] = (acc[drift.code] ?? 0) + 1;
    return acc;
  }, {});

  return {
    ok: drifts.length === 0,
    checkedAt: new Date().toISOString(),
    drifts,
    summary: { driftCount: drifts.length, byCode },
  };
}
