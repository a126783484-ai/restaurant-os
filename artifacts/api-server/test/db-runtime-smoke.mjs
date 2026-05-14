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
  console.log("DB runtime smoke checks passed");
} finally {
  await rm(outdir, { recursive: true, force: true });
}
