import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

const outdir = await mkdtemp(path.join(tmpdir(), "restaurant-os-db-runtime-"));
try {
  const outfile = path.join(outdir, "db.cjs");
  await build({
    entryPoints: [new URL("../../../lib/db/src/index.ts", import.meta.url).pathname],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["pg-native"],
    logLevel: "silent",
  });
  const require = createRequire(import.meta.url);
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const db = require(outfile);
  const status = db.getDatabaseRuntimeStatus();
  assert.equal(status.strategy, "node-postgres-fail-fast");
  assert.equal(typeof status.configured, "boolean");
  assert.equal(typeof status.initialized, "boolean");
  assert.equal(typeof status.poolMax, "number");
  assert.equal(typeof status.connectionTimeoutMillis, "number");
  assert.equal(typeof status.queryTimeoutMillis, "number");
  assert.equal(typeof status.idleTimeoutMillis, "number");
  assert.equal(typeof status.circuitOpen, "boolean");
  assert.ok("circuitOpenUntil" in status, "runtime status exposes circuitOpenUntil");
  assert.ok("lastConnectionError" in status, "runtime status exposes lastConnectionError");

  const failedConnection = await db.checkDatabaseConnection();
  assert.equal(failedConnection.ok, false, "missing DATABASE_URL fails fast instead of hanging");
  const afterFailure = db.getDatabaseRuntimeStatus();
  assert.equal(afterFailure.circuitOpen, true, "DB failure opens the circuit breaker");
  assert.equal(typeof afterFailure.lastConnectionError, "string", "DB failure records last connection error");
  if (previousDatabaseUrl) process.env.DATABASE_URL = previousDatabaseUrl;
  console.log("DB runtime smoke checks passed");
} finally {
  await rm(outdir, { recursive: true, force: true });
}
