import { pool } from "@workspace/db";
import { centsToAmount, toCents } from "./v3-core";
import { ensurePaymentSchema } from "./payment-service";
import { ACTIVE_DINE_IN_ORDER_STATUSES } from "./order-domain-service";

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
  };
};

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

export async function getConsistencyReport(): Promise<ConsistencyReport> {
  await ensurePaymentSchema();
  const drifts: ConsistencyDrift[] = [];
  const orders = await pool.query(
    `SELECT o.id,
            o.status,
            o.total_amount,
            o.paid_amount,
            COALESCE(items.item_subtotal, 0)::float AS item_subtotal,
            COALESCE(payments.charge_amount, 0)::float AS charge_amount,
            COALESCE(payments.refund_amount, 0)::float AS refund_amount
     FROM orders o
     LEFT JOIN (
       SELECT order_id, SUM(subtotal)::float AS item_subtotal
       FROM order_items
       GROUP BY order_id
     ) items ON items.order_id = o.id
     LEFT JOIN (
       SELECT order_id,
              SUM(amount) FILTER (WHERE status = 'paid')::float AS charge_amount,
              SUM(amount) FILTER (WHERE status = 'refunded')::float AS refund_amount
       FROM payments
       GROUP BY order_id
     ) payments ON payments.order_id = o.id
     ORDER BY o.id DESC
     LIMIT 200`,
  );

  for (const row of orders.rows) {
    drifts.push(...detectOrderMoneyDrift({
      orderId: Number(row.id),
      orderStatus: String(row.status),
      orderTotal: Number(row.total_amount ?? 0),
      itemSubtotal: Number(row.item_subtotal ?? 0),
      orderPaid: Number(row.paid_amount ?? 0),
      chargeAmount: Number(row.charge_amount ?? 0),
      refundAmount: Number(row.refund_amount ?? 0),
    }));
  }

  const tableRows = await pool.query(
    `SELECT t.id,
            t.status,
            COUNT(o.id)::int AS active_order_count
     FROM tables t
     LEFT JOIN orders o ON o.table_id = t.id AND o.type = 'dine-in' AND o.status = ANY($1::text[])
     GROUP BY t.id
     ORDER BY t.id`,
    [[...ACTIVE_DINE_IN_ORDER_STATUSES]],
  );

  for (const row of tableRows.rows) {
    const activeOrderCount = Number(row.active_order_count ?? 0);
    if (activeOrderCount > 0 && row.status !== "occupied") {
      drifts.push({
        code: "TABLE_OCCUPANCY_DRIFT",
        entityType: "table",
        entityId: Number(row.id),
        expected: "occupied",
        actual: String(row.status),
        message: "Table has active dine-in orders but is not marked occupied.",
      });
    }
  }

  return {
    ok: drifts.length === 0,
    checkedAt: new Date().toISOString(),
    drifts,
    summary: { driftCount: drifts.length },
  };
}
