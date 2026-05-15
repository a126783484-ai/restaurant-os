#!/usr/bin/env node
import pg from "pg";

const args = new Set(process.argv.slice(2));
const requestedApply = args.has("--apply");
const explicitDryRun = args.has("--dry-run");

if (requestedApply) {
  console.error(
    "--apply is intentionally not implemented for this production drift report. Run without --apply or with --dry-run to inspect suggested repairs only.",
  );
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required to inspect production data. No data was modified.",
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const REPORT_VERSION = "production-data-drift-dry-run-v1";
const activeStatuses = ["pending", "preparing", "ready"];
const allowedOrderStatuses = [
  "pending",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];
const allowedOrderTypes = ["dine-in", "takeout"];
const categoryLabels = {
  safe_automatic_candidate: "safe automatic candidate",
  needs_human_decision: "needs human decision",
  do_not_auto_fix: "do not auto-fix",
};

function cents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function derivedPaymentStatus({
  orderStatus,
  totalCents,
  netPaidCents,
  refundCents,
}) {
  if (orderStatus === "cancelled") {
    if (netPaidCents === 0) return "cancelled";
    return refundCents > 0 ? "refunded" : "partially_paid";
  }
  if (netPaidCents === 0) return refundCents > 0 ? "refunded" : "unpaid";
  if (netPaidCents < totalCents) return "partially_paid";
  return "paid";
}

function makeDrift({
  code,
  category,
  entityType,
  entityId,
  description,
  evidence,
  suggestedAction,
  futureApplyCommand = null,
}) {
  return {
    code,
    category,
    categoryLabel: categoryLabels[category],
    entityType,
    entityId,
    description,
    evidence,
    suggestedAction,
    futureApplyCommand,
  };
}

function groupedDrifts(drifts) {
  return Object.fromEntries(
    Object.keys(categoryLabels).map((category) => [
      categoryLabels[category],
      drifts.filter((drift) => drift.category === category),
    ]),
  );
}

function driftCounts(drifts) {
  return Object.fromEntries(
    Object.keys(categoryLabels).map((category) => [
      categoryLabels[category],
      drifts.filter((drift) => drift.category === category).length,
    ]),
  );
}

await client.connect();
try {
  const drifts = [];
  const orders = await client.query(`
    SELECT o.id, o.status, o.type, o.total_amount, o.paid_amount, o.payment_status, o.table_id,
           t.status AS table_status,
           COALESCE(items.item_count, 0)::int AS item_count,
           COALESCE(items.item_subtotal, 0)::float AS item_subtotal,
           COALESCE(payments.payment_count, 0)::int AS payment_count,
           COALESCE(payments.charge_amount, 0)::float AS charge_amount,
           COALESCE(payments.refund_amount, 0)::float AS refund_amount,
           COALESCE(payments.void_amount, 0)::float AS void_amount,
           COALESCE(payments.net_paid, 0)::float AS net_paid
    FROM orders o
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS item_count, SUM(subtotal)::float AS item_subtotal
      FROM order_items
      GROUP BY order_id
    ) items ON items.order_id = o.id
    LEFT JOIN (
      SELECT order_id,
             COUNT(*)::int AS payment_count,
             COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::float AS charge_amount,
             COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::float AS refund_amount,
             COALESCE(SUM(amount) FILTER (WHERE status = 'cancelled'), 0)::float AS void_amount,
             (COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) - COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0))::float AS net_paid
      FROM payments
      GROUP BY order_id
    ) payments ON payments.order_id = o.id
    ORDER BY o.id DESC
    LIMIT 1000`);

  for (const row of orders.rows) {
    const active = activeStatuses.includes(row.status);
    const dineIn = row.type === "dine-in";
    const totalCents = cents(row.total_amount);
    const itemSubtotalCents = cents(row.item_subtotal);
    const paidAmountCents = cents(row.paid_amount);
    const netPaidCents = cents(row.net_paid);
    const refundCents = cents(row.refund_amount);
    const expectedPaymentStatus = derivedPaymentStatus({
      orderStatus: row.status,
      totalCents,
      netPaidCents,
      refundCents,
    });

    if (!allowedOrderStatuses.includes(row.status)) {
      drifts.push(
        makeDrift({
          code: "INVALID_ORDER_STATUS",
          category: "needs_human_decision",
          entityType: "order",
          entityId: row.id,
          description: `Order uses unsupported status ${row.status}.`,
          evidence: { status: row.status, allowedOrderStatuses },
          suggestedAction:
            "Map the legacy status to pending/preparing/ready/completed/cancelled only after an operator confirms the current order lifecycle state.",
        }),
      );
    }

    if (!allowedOrderTypes.includes(row.type)) {
      drifts.push(
        makeDrift({
          code: "INVALID_ORDER_TYPE",
          category: "needs_human_decision",
          entityType: "order",
          entityId: row.id,
          description: `Order uses unsupported type ${row.type}.`,
          evidence: { type: row.type, allowedOrderTypes },
          suggestedAction:
            "Map the legacy type to dine-in or takeout only after an operator confirms how the order should be fulfilled.",
        }),
      );
    }

    if (
      active &&
      Number(row.item_count) === 0 &&
      Number(row.payment_count) > 0
    ) {
      drifts.push(
        makeDrift({
          code: "ACTIVE_ORDER_WITHOUT_ITEMS_BUT_WITH_PAYMENTS",
          category: "do_not_auto_fix",
          entityType: "order",
          entityId: row.id,
          description:
            "Active order has payment ledger entries but no immutable order item snapshots.",
          evidence: {
            status: row.status,
            itemCount: Number(row.item_count),
            paymentCount: Number(row.payment_count),
            netPaid: row.net_paid,
          },
          suggestedAction:
            "Do not delete the order or payment records. Reconstruct missing item snapshots from source receipts/POS history, or obtain manager approval for a manual financial correction.",
        }),
      );
    } else if (active && Number(row.item_count) === 0) {
      drifts.push(
        makeDrift({
          code: "ACTIVE_ORDER_WITHOUT_ITEMS",
          category: "needs_human_decision",
          entityType: "order",
          entityId: row.id,
          description: "Active order has no immutable order item snapshots.",
          evidence: {
            status: row.status,
            itemCount: Number(row.item_count),
            paymentCount: Number(row.payment_count),
          },
          suggestedAction:
            "Ask floor/kitchen staff whether the order is still real before adding item snapshots or cancelling it through the normal audited order flow.",
        }),
      );
    }

    if (active && dineIn && row.table_id === null) {
      drifts.push(
        makeDrift({
          code: "ACTIVE_DINE_IN_ORDER_WITHOUT_TABLE",
          category: "needs_human_decision",
          entityType: "order",
          entityId: row.id,
          description: "Active dine-in order is not assigned to a table.",
          evidence: {
            status: row.status,
            type: row.type,
            tableId: row.table_id,
          },
          suggestedAction:
            "Ask floor staff which physical table owns the order, then assign the correct table through an audited operational action.",
        }),
      );
    }

    if (
      active &&
      dineIn &&
      row.table_id !== null &&
      row.table_status !== "occupied"
    ) {
      drifts.push(
        makeDrift({
          code: "ACTIVE_ORDER_TABLE_MISMATCH",
          category: "safe_automatic_candidate",
          entityType: "order",
          entityId: row.id,
          description:
            "Active dine-in order is assigned to a table that is not marked occupied.",
          evidence: {
            status: row.status,
            type: row.type,
            tableId: row.table_id,
            tableStatus: row.table_status,
          },
          suggestedAction:
            "Candidate automatic repair: mark the assigned table occupied after confirming there is only one active dine-in order for that table.",
          futureApplyCommand:
            "pnpm --filter @workspace/api-server run repair:v3-production-data -- --apply --only ACTIVE_ORDER_TABLE_MISMATCH",
        }),
      );
    }

    if (totalCents !== itemSubtotalCents) {
      drifts.push(
        makeDrift({
          code: "ORDER_TOTAL_ITEM_SUBTOTAL_DRIFT",
          category: "safe_automatic_candidate",
          entityType: "order",
          entityId: row.id,
          description:
            "Order total_amount does not match the sum of order_items.subtotal.",
          evidence: {
            totalAmount: row.total_amount,
            itemSubtotal: row.item_subtotal,
            totalCents,
            itemSubtotalCents,
          },
          suggestedAction:
            "Candidate automatic repair: recalculate order total_amount from immutable order_items subtotals; do not change any item snapshots.",
          futureApplyCommand:
            "pnpm --filter @workspace/api-server run repair:v3-production-data -- --apply --only ORDER_TOTAL_ITEM_SUBTOTAL_DRIFT",
        }),
      );
    }

    if (
      paidAmountCents !== netPaidCents ||
      row.payment_status !== expectedPaymentStatus
    ) {
      drifts.push(
        makeDrift({
          code: "ORDER_PAYMENT_LEDGER_DRIFT",
          category: "safe_automatic_candidate",
          entityType: "order",
          entityId: row.id,
          description:
            "Order paid_amount/payment_status does not match the payment ledger summary.",
          evidence: {
            paidAmount: row.paid_amount,
            ledgerNetPaid: row.net_paid,
            paymentStatus: row.payment_status,
            expectedPaymentStatus,
            chargeAmount: row.charge_amount,
            refundAmount: row.refund_amount,
            voidAmount: row.void_amount,
            paymentCount: Number(row.payment_count),
          },
          suggestedAction:
            "Candidate automatic repair: derive paid_amount and payment_status from the immutable payment ledger; do not create, delete, or rewrite payment records.",
          futureApplyCommand:
            "pnpm --filter @workspace/api-server run repair:v3-production-data -- --apply --only ORDER_PAYMENT_LEDGER_DRIFT",
        }),
      );
    }
  }

  const missingPayments = await client.query(`
    SELECT p.id, p.order_id
    FROM payments p
    LEFT JOIN orders o ON o.id = p.order_id
    WHERE o.id IS NULL
    ORDER BY p.id DESC
    LIMIT 200`);
  for (const row of missingPayments.rows) {
    drifts.push(
      makeDrift({
        code: "PAYMENT_MISSING_ORDER",
        category: "do_not_auto_fix",
        entityType: "payment",
        entityId: row.id,
        description: `Payment references missing order ${row.order_id}.`,
        evidence: { orderId: row.order_id },
        suggestedAction:
          "Do not delete the payment. Restore the missing order record from backup/source history or quarantine the orphan payment after finance review.",
      }),
    );
  }

  const tableRows = await client.query(
    `
    SELECT t.id, t.status, COUNT(o.id)::int AS active_order_count, ARRAY_REMOVE(ARRAY_AGG(o.id ORDER BY o.id), NULL) AS active_order_ids
    FROM tables t
    LEFT JOIN orders o ON o.table_id = t.id AND o.type = 'dine-in' AND o.status = ANY($1::text[])
    GROUP BY t.id, t.status
    ORDER BY t.id`,
    [activeStatuses],
  );
  for (const row of tableRows.rows) {
    const activeOrderCount = Number(row.active_order_count);
    if (activeOrderCount > 1) {
      drifts.push(
        makeDrift({
          code: "TABLE_MULTIPLE_ACTIVE_ORDERS",
          category: "needs_human_decision",
          entityType: "table",
          entityId: row.id,
          description: "Table has multiple active dine-in orders assigned.",
          evidence: {
            tableStatus: row.status,
            activeOrderCount,
            activeOrderIds: row.active_order_ids,
          },
          suggestedAction:
            "Ask floor staff which active orders belong to the current seating before moving, merging, or closing any order through audited workflows.",
        }),
      );
    }
    if (activeOrderCount === 0 && row.status === "occupied") {
      drifts.push(
        makeDrift({
          code: "OCCUPIED_TABLE_WITHOUT_ACTIVE_ORDER",
          category: "needs_human_decision",
          entityType: "table",
          entityId: row.id,
          description:
            "Table is marked occupied but has no active dine-in order.",
          evidence: { tableStatus: row.status, activeOrderCount },
          suggestedAction:
            "Ask floor staff whether guests are still seated; if clear, move the table to cleaning/available through the normal audited table status flow.",
        }),
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        reportVersion: REPORT_VERSION,
        dryRun: true,
        dryRunDefaulted: !explicitDryRun,
        applied: false,
        destructiveActionsAllowed: false,
        checkedAt: new Date().toISOString(),
        activeStatuses,
        totalDriftCount: drifts.length,
        driftCountsByCategory: driftCounts(drifts),
        driftCodesDetected: [
          ...new Set(drifts.map((drift) => drift.code)),
        ].sort(),
        categories: groupedDrifts(drifts),
        drifts,
        applyStatus: {
          implemented: false,
          productionRepairApplied: false,
          note: "This report is dry-run only. --apply exits without modifying data until a future approved PR implements guarded repairs.",
          futureExactApplyCommandTemplate:
            "pnpm --filter @workspace/api-server run repair:v3-production-data -- --apply --only <DRIFT_CODE>",
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
