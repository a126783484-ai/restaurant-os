import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/routes/tables.ts", import.meta.url),
  "utf8",
);

assert.match(
  source,
  /TABLE_NUMBER_EXISTS/,
  "duplicate table number errors return a specific contract code",
);
assert.match(
  source,
  /DATABASE_UNAVAILABLE/,
  "table routes return structured database-unavailable errors",
);
assert.match(
  source,
  /handleTableError\(res, next, error\)/,
  "table route failures pass through the shared error contract",
);
assert.match(
  source,
  /TABLE_HAS_ACTIVE_ORDER/,
  "active order delete guard exposes the singular API error code",
);
assert.match(
  source,
  /TABLE_HAS_ACTIVE_RESERVATION/,
  "active reservation delete guard exposes the singular API error code",
);

console.log("table error contract smoke passed");
