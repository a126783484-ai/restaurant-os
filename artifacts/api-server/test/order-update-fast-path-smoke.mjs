import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/routes/orders.ts", import.meta.url), "utf8");
const patchStart = source.indexOf('router.patch("/orders/:id"');
assert.notEqual(patchStart, -1, "orders PATCH route exists");
const patchSource = source.slice(patchStart);
const ensureIndex = patchSource.indexOf("await ensureOrderSchema();");
const fastPathIndex = patchSource.indexOf("updateDbOrderStatusOnly");
assert(ensureIndex !== -1 && fastPathIndex !== -1 && ensureIndex < fastPathIndex, "status fast path ensures order schema first");
assert.match(patchSource, /normalizeOrderStatus\(update\.status\) !== "cancelled"/, "cancelled status updates are excluded from fast path");
assert.match(source, /calculateOrderPaymentSummary\(existing\.id\)/, "cancelled full path still uses ledger summary protection");
assert.match(source, /SELECT id, table_id, status[\s\S]*FOR UPDATE/, "fast path locks target order row");

console.log("order update fast path smoke passed");
