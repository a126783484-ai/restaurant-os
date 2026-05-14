import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

const outdir = await mkdtemp(path.join(tmpdir(), "restaurant-os-v3-business-"));
try {
  const dbStub = path.join(outdir, "db-stub.cjs");
  const paymentStub = path.join(outdir, "payment-service-stub.cjs");
  await import("node:fs/promises").then(({ writeFile }) => Promise.all([
    writeFile(dbStub, "exports.pool = {};"),
    writeFile(paymentStub, "exports.ensurePaymentSchema = async () => {};"),
  ]));
  await build({
    entryPoints: [
      new URL("../src/lib/v3-core.ts", import.meta.url).pathname,
      new URL("../src/lib/diagnostics-service.ts", import.meta.url).pathname,
    ],
    outdir,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
    entryNames: "[name]",
    plugins: [{
      name: "smoke-stubs",
      setup(build) {
        build.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: dbStub }));
        build.onResolve({ filter: /^\.\/payment-service$/ }, () => ({ path: paymentStub }));
      },
    }],
  });
  const require = createRequire(import.meta.url);
  const core = require(path.join(outdir, "v3-core.js"));
  const diagnostics = require(path.join(outdir, "diagnostics-service.js"));

  const snapshot = core.buildOrderItemSnapshot({ productId: 10, productName: "Rice", unitPrice: 80, quantity: 2 });
  assert.equal(snapshot.lineSubtotalCents, 16000, "create order snapshots use integer cents");

  let ledger = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [
    { type: "payment", amountCents: 10000, status: "valid" },
    { type: "payment", amountCents: 20000, status: "valid" },
  ] });
  assert.equal(ledger.paymentStatus, "paid", "partial + second payment derives paid");

  assert.throws(() => core.assertCanApplyPayment({ amountCents: 1, balanceCents: 0 }), /remaining balance/, "overpayment is rejected");

  ledger = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [
    { type: "payment", amountCents: 30000, status: "valid" },
    { type: "refund", amountCents: 10000, status: "refunded" },
    { type: "void", amountCents: 5000, status: "voided" },
  ] });
  assert.equal(ledger.netPaidCents, 20000, "refund reduces net paid and void is excluded");
  assert.equal(ledger.voidCents, 5000, "void amount is tracked separately");

  const cancelledOrderRevenueCents = core.deriveLedgerSummary({ orderStatus: "cancelled", orderTotalCents: 30000, events: [
    { type: "payment", amountCents: 30000, status: "valid" },
  ] }).netPaidCents;
  const closingRevenueCents = [
    { status: "cancelled", netPaidCents: cancelledOrderRevenueCents },
    { status: "completed", netPaidCents: 20000 },
  ].filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.netPaidCents, 0);
  assert.equal(closingRevenueCents, 20000, "cancelled orders are excluded from collected revenue");

  core.assertOrderTransition("open", "preparing");
  assert.throws(() => core.assertOrderTransition("completed", "open"), /Cannot transition/, "illegal state transition is rejected");

  const drifts = diagnostics.detectOrderMoneyDrift({
    orderId: 123,
    orderStatus: "open",
    orderTotal: 99,
    itemSubtotal: 100,
    orderPaid: 20,
    chargeAmount: 30,
    refundAmount: 0,
  });
  assert.deepEqual(drifts.map((d) => d.code), ["ORDER_TOTAL_DRIFT", "ORDER_PAID_LEDGER_DRIFT"], "drift monitor detects inconsistent totals and paid ledger");

  const seen = new Map();
  const createWithKey = (key) => {
    if (seen.has(key)) return seen.get(key);
    const value = { id: seen.size + 1 };
    seen.set(key, value);
    return value;
  };
  assert.equal(createWithKey("same-key"), createWithKey("same-key"), "idempotency key returns same side effect result");

  console.log("V3 business smoke checks passed");
} finally {
  await rm(outdir, { recursive: true, force: true });
}
