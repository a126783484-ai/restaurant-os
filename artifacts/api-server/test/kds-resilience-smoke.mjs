import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

const outdir = await mkdtemp(path.join(tmpdir(), "restaurant-os-kds-resilience-"));
try {
  await build({
    entryPoints: [new URL("../src/lib/kds-resilience.ts", import.meta.url).pathname],
    outdir,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
    entryNames: "[name]",
  });
  const require = createRequire(import.meta.url);
  const { detectKdsDataQualityIssue, mapKdsDbOrderRow } = require(path.join(outdir, "kds-resilience.js"));

  const baseOrder = {
    id: 10,
    customer_id: null,
    table_id: 4,
    type: "dine-in",
    status: "pending",
    payment_status: "unpaid",
    payment_method: "unpaid",
    paid_amount: 0,
    total_amount: 120,
    payment_note: null,
    paid_at: null,
    notes: null,
    created_at: new Date("2026-05-14T00:00:00.000Z"),
    table_status: "occupied",
    table_exists: true,
  };
  const item = { id: 1, order_id: 10, product_id: 5, product_name: "Noodles", quantity: 2, unit_price: 60, subtotal: 120, notes: null };

  const healthy = mapKdsDbOrderRow(baseOrder, [item]);
  assert.equal(healthy.dataQualityIssue, undefined, "healthy active order has no warning");
  assert.equal(healthy.items.length, 1, "healthy order keeps item snapshots");

  const noItems = mapKdsDbOrderRow(baseOrder, []);
  assert.equal(noItems.dataQualityIssue, true, "active order without items is still returned with a warning");
  assert.equal(noItems.dataQualityCode, "ACTIVE_ORDER_WITHOUT_ITEMS");

  const noTable = detectKdsDataQualityIssue({ ...baseOrder, table_id: null }, [item]);
  assert.equal(noTable.dataQualityCode, "ACTIVE_DINE_IN_WITHOUT_TABLE");

  const wrongTableStatus = detectKdsDataQualityIssue({ ...baseOrder, table_status: "available", table_exists: true }, [item]);
  assert.equal(wrongTableStatus.dataQualityCode, "ACTIVE_ORDER_TABLE_NOT_OCCUPIED");

  const missingTable = detectKdsDataQualityIssue({ ...baseOrder, table_status: null, table_exists: false }, [item]);
  assert.equal(missingTable.dataQualityCode, "ACTIVE_ORDER_TABLE_NOT_OCCUPIED");

  console.log("KDS resilience smoke passed");
} finally {
  await rm(outdir, { recursive: true, force: true });
}
