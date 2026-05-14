#!/usr/bin/env node
import pg from "pg";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
if (apply) {
  console.error("--apply is intentionally not implemented in this P0 patch. Run without --apply or with --dry-run to inspect suggested repairs only.");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to inspect production data. No data was modified.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const activeStatuses = ["pending", "preparing", "ready"];

function action(code, entityType, entityId, description, suggestedRepair) {
  return { code, entityType, entityId, description, suggestedRepair };
}

await client.connect();
try {
  const actions = [];
  const orders = await client.query(`
    SELECT o.id, o.status, o.type, o.total_amount, o.paid_amount, o.payment_status, o.table_id,
           COALESCE(items.item_count, 0)::int AS item_count,
           COALESCE(items.item_subtotal, 0)::float AS item_subtotal,
           COALESCE(payments.net_paid, 0)::float AS net_paid
    FROM orders o
    LEFT JOIN (SELECT order_id, COUNT(*)::int AS item_count, SUM(subtotal)::float AS item_subtotal FROM order_items GROUP BY order_id) items ON items.order_id = o.id
    LEFT JOIN (SELECT order_id, (COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) - COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0))::float AS net_paid FROM payments GROUP BY order_id) payments ON payments.order_id = o.id
    ORDER BY o.id DESC
    LIMIT 500`);

  for (const row of orders.rows) {
    if (!["pending", "preparing", "ready", "completed", "cancelled"].includes(row.status)) {
      actions.push(action("INVALID_ORDER_STATUS", "order", row.id, `Unsupported status ${row.status}`, "Map legacy status to pending/preparing/ready/completed/cancelled after human review."));
    }
    if (!["dine-in", "takeout"].includes(row.type)) {
      actions.push(action("INVALID_ORDER_TYPE", "order", row.id, `Unsupported type ${row.type}`, "Map legacy type to dine-in or takeout after human review."));
    }
    if (Number(row.item_count) === 0) {
      actions.push(action("ORDER_WITHOUT_ITEMS", "order", row.id, "Order has no order_items", "Review receipt/source record; recreate missing item snapshots or cancel test/legacy order with approval."));
    }
    if (Math.round(Number(row.total_amount ?? 0) * 100) !== Math.round(Number(row.item_subtotal ?? 0) * 100)) {
      actions.push(action("ORDER_TOTAL_DRIFT", "order", row.id, `total=${row.total_amount} itemSubtotal=${row.item_subtotal}`, "Recalculate order total from immutable order_items subtotal after human approval."));
    }
    if (Math.round(Number(row.paid_amount ?? 0) * 100) !== Math.round(Number(row.net_paid ?? 0) * 100)) {
      actions.push(action("ORDER_PAID_LEDGER_DRIFT", "order", row.id, `paid=${row.paid_amount} ledgerNet=${row.net_paid}`, "Sync paid_amount/payment_status from payment ledger after human approval."));
    }
  }

  const missingPayments = await client.query(`SELECT p.id, p.order_id FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE o.id IS NULL ORDER BY p.id DESC LIMIT 200`);
  for (const row of missingPayments.rows) {
    actions.push(action("PAYMENT_MISSING_ORDER", "payment", row.id, `References missing order ${row.order_id}`, "Restore the missing order or quarantine the orphan payment after finance review."));
  }

  const tableRows = await client.query(`
    SELECT t.id, t.status, COUNT(o.id)::int AS active_order_count
    FROM tables t
    LEFT JOIN orders o ON o.table_id = t.id AND o.type = 'dine-in' AND o.status = ANY($1::text[])
    GROUP BY t.id, t.status
    ORDER BY t.id`, [activeStatuses]);
  for (const row of tableRows.rows) {
    if (Number(row.active_order_count) > 0 && row.status !== "occupied") {
      actions.push(action("TABLE_SHOULD_BE_OCCUPIED", "table", row.id, `status=${row.status} activeOrders=${row.active_order_count}`, "Mark table occupied only after confirming active dine-in order is real."));
    }
    if (Number(row.active_order_count) === 0 && row.status === "occupied") {
      actions.push(action("TABLE_OCCUPIED_WITHOUT_ACTIVE_ORDER", "table", row.id, "Occupied table has no active order", "Move table to cleaning/available after floor staff confirms no guest is seated."));
    }
  }

  console.log(JSON.stringify({ ok: true, dryRun: true, applied: false, checkedAt: new Date().toISOString(), suggestedRepairCount: actions.length, suggestedRepairActions: actions }, null, 2));
} finally {
  await client.end();
}
