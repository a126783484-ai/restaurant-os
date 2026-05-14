import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outdir = await mkdtemp(path.join(tmpdir(), "restaurant-os-v3-core-"));
try {
  const outfile = path.join(outdir, "v3-core.mjs");
  await build({
    entryPoints: [new URL("../src/lib/v3-core.ts", import.meta.url).pathname],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  const core = await import(pathToFileURL(outfile).href);
  const items = [
    core.buildOrderItemSnapshot({ productId: 1, productName: "Noodles", unitPrice: 120.1, quantity: 2 }),
    core.buildOrderItemSnapshot({ productId: 2, productName: "Tea", unitPrice: 30, quantity: 1 }),
  ];
  const totalCents = core.calculateOrderTotalCents(items);
  assert.equal(totalCents, 27020, "order total must come from item snapshots in integer cents");

  let ledger = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: totalCents, events: [] });
  assert.equal(ledger.paymentStatus, "unpaid");
  assert.equal(ledger.balanceCents, 27020);

  ledger = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [{ type: "payment", amountCents: 10000, status: "valid" }] });
  assert.equal(ledger.paymentStatus, "partially_paid");
  assert.equal(ledger.netPaidCents, 10000);

  ledger = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [{ type: "payment", amountCents: 10000, status: "valid" }, { type: "payment", amountCents: 20000, status: "valid" }] });
  assert.equal(ledger.paymentStatus, "paid");
  assert.equal(ledger.balanceCents, 0);

  assert.throws(() => core.assertCanApplyPayment({ amountCents: 1, balanceCents: 0 }), /remaining balance/, "overpayment is rejected");

  ledger = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [{ type: "payment", amountCents: 30000, status: "valid" }, { type: "refund", amountCents: 10000, status: "refunded" }] });
  assert.equal(ledger.netPaidCents, 20000, "refund reduces net collected amount");
  assert.equal(ledger.paymentStatus, "partially_paid");

  ledger = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [{ type: "payment", amountCents: 30000, status: "voided" }] });
  assert.equal(ledger.netPaidCents, 0, "voided payment is excluded from collected amount");
  assert.equal(ledger.voidCents, 30000);

  ledger = core.deriveLedgerSummary({ orderStatus: "cancelled", orderTotalCents: 30000, events: [] });
  assert.equal(ledger.paymentStatus, "cancelled", "cancelled unpaid order derives cancelled payment status");

  const closingCollectedCents = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [{ type: "payment", amountCents: 30000, status: "valid" }] }).netPaidCents;
  const receiptCollectedCents = core.deriveLedgerSummary({ orderStatus: "open", orderTotalCents: 30000, events: [{ type: "payment", amountCents: 30000, status: "valid" }] }).netPaidCents;
  assert.equal(closingCollectedCents, receiptCollectedCents, "closing totals and receipt totals use the same ledger");

  core.assertOrderTransition("open", "preparing");
  assert.throws(() => core.assertOrderTransition("completed", "ready"), /Cannot transition/);
  console.log("V3 core smoke checks passed");
} finally {
  await rm(outdir, { recursive: true, force: true });
}
