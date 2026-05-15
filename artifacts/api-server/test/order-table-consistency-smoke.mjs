import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/routes/orders.ts", import.meta.url),
  "utf8",
);
const createStart = source.indexOf("async function createDbOrderTransaction");
assert.notEqual(createStart, -1, "createDbOrderTransaction exists");
const createSource = source.slice(
  createStart,
  source.indexOf("async function syncTableAfterTerminalOrder", createStart),
);

assert.match(
  createSource,
  /ORDER_TABLE_REQUIRED/,
  "dine-in order creation rejects missing tables",
);
assert.match(
  createSource,
  /SELECT id FROM tables WHERE id = \$1 FOR UPDATE/,
  "dine-in order creation locks the selected table",
);
assert.match(
  createSource,
  /TABLE_NOT_FOUND/,
  "dine-in order creation reports missing selected tables",
);
assert.match(
  createSource,
  /UPDATE tables SET status = 'occupied'/,
  "dine-in order creation synchronizes table occupied status",
);
assert.match(
  createSource,
  /TABLE_STATUS_SYNC_FAILED/,
  "dine-in order creation fails if table occupancy cannot be synchronized",
);
assert.match(
  createSource,
  /getDbOrderWithClient\(client, orderId\)/,
  "created orders are re-read inside the transaction without opening a second pool connection",
);

console.log("order table consistency smoke passed");
