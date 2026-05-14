import assert from "node:assert/strict";
import { attachResilientPaymentSummary } from "../src/lib/order-payment-resilience.ts";

const orders = [
  { id: 101, status: "pending", paymentStatus: "unpaid", totalAmount: 120, paidAmount: 0 },
  { id: 102, status: "pending", paymentStatus: "partially_paid", totalAmount: 200, paidAmount: 50 },
];

async function calculate(orderId) {
  if (orderId === 102) {
    const error = new Error("legacy ledger row is invalid");
    error.code = "LEGACY_LEDGER_INVALID";
    throw error;
  }
  return { totalAmount: 120, paidAmount: 120, balance: 0, paymentStatus: "paid", paymentCount: 1 };
}

const response = await Promise.all(orders.map((order) => attachResilientPaymentSummary(order, calculate)));

assert.equal(response.length, 2, "/api/orders enrichment should still return all orders");
assert.equal(response[0].paymentSummaryUnavailable, false, "healthy order keeps payment summary");
assert.equal(response[0].paymentStatus, "paid", "healthy order is enriched normally");
assert.equal(response[1].paymentSummaryUnavailable, true, "bad order is flagged as degraded");
assert.equal(response[1].paymentSummaryErrorCode, "LEGACY_LEDGER_INVALID", "bad order exposes structured error code");
assert.match(response[1].paymentSummaryErrorMessage, /legacy ledger row/, "bad order exposes readable error message");
assert.equal(response[1].paymentStatus, "partially_paid", "bad order falls back to stored order payment status");
assert.equal(response[1].balance, 150, "bad order gets a safe fallback balance");

console.log("orders resilience smoke passed");
