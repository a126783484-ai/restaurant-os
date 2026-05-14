import { pool } from "@workspace/db";
import type { AuthRole, AuthUser } from "../middlewares/auth";
import {
  assertCanApplyPayment,
  centsToAmount,
  deriveLedgerSummary,
  toCents,
  type DerivedPaymentStatus,
  type PaymentMethod as V3PaymentMethod,
} from "./v3-core";

export type PaymentMethod = V3PaymentMethod;
export type PaymentStatus = "paid" | "refunded" | "cancelled";
export type OrderPaymentStatus = DerivedPaymentStatus;

export const PAYMENT_METHODS = new Set<PaymentMethod>(["cash", "card", "transfer", "external"]);
export const PAYMENT_STATUSES = new Set<PaymentStatus>(["paid", "refunded", "cancelled"]);

export type PaymentRecord = {
  id: number;
  orderId: number;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  note: string | null;
  externalReference: string | null;
  createdBy: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  refundedAt: string | null;
  cancelledAt: string | null;
};

export type PaymentSummary = {
  totalAmount: number;
  paidAmount: number;
  balance: number;
  paymentStatus: OrderPaymentStatus;
  paymentCount: number;
};

export type OrderPaymentBundle = PaymentSummary & {
  payments: PaymentRecord[];
};

function roundMoney(value: number): number {
  return centsToAmount(toCents(value));
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function nullableIso(value: unknown): string | null {
  if (!value) return null;
  return toIso(value);
}

function mapPayment(row: Record<string, any>): PaymentRecord {
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    amount: roundMoney(Number(row.amount)),
    method: row.method,
    status: row.status,
    note: row.note ?? null,
    externalReference: row.external_reference ?? null,
    createdBy: row.created_by == null ? null : Number(row.created_by),
    createdByName: row.created_by_name ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    refundedAt: nullableIso(row.refunded_at),
    cancelledAt: nullableIso(row.cancelled_at),
  };
}

export function deriveOrderPaymentStatus(
  paidAmount: number,
  totalAmount: number,
  orderStatus?: string,
  refundedAmount = 0,
): OrderPaymentStatus {
  return deriveLedgerSummary({
    orderStatus,
    orderTotalCents: toCents(totalAmount),
    events: [
      { type: "payment", amountCents: toCents(paidAmount), status: "valid" },
      ...(refundedAmount > 0 ? [{ type: "refund" as const, amountCents: toCents(refundedAmount), status: "refunded" as const }] : []),
    ],
  }).paymentStatus;
}

export function canAddPayment(role?: AuthRole): boolean {
  return role === "admin" || role === "manager" || role === "staff";
}

export function canManagePayment(role?: AuthRole): boolean {
  return role === "admin" || role === "manager";
}

export function canViewClosing(role?: AuthRole): boolean {
  return role === "admin" || role === "manager";
}

export async function ensurePaymentSchema(): Promise<void> {
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount REAL NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'unpaid'");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_note TEXT");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ");
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount REAL NOT NULL DEFAULT 0,
    method TEXT NOT NULL DEFAULT 'cash',
    status TEXT NOT NULL DEFAULT 'paid',
    note TEXT,
    external_reference TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    refunded_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
  )`);
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount REAL NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'cash'");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid'");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS note TEXT");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_reference TEXT");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'payment'");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)");
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before JSONB,
    after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)");
}

export async function writeAuditLog(input: {
  actor?: AuthUser | null;
  action: string;
  entityType: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await ensurePaymentSchema();
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      input.actor?.id ?? null,
      input.action,
      input.entityType,
      String(input.entityId),
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
    ],
  );
}

export async function listOrderPayments(orderId: number): Promise<PaymentRecord[]> {
  await ensurePaymentSchema();
  const result = await pool.query(
    `SELECT p.*, u.name AS created_by_name
     FROM payments p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.order_id = $1
     ORDER BY p.created_at DESC, p.id DESC`,
    [orderId],
  );
  return result.rows.map(mapPayment);
}

export async function calculateOrderPaymentSummary(orderId: number): Promise<PaymentSummary> {
  await ensurePaymentSchema();
  const orderResult = await pool.query(
    "SELECT id, status, total_amount FROM orders WHERE id = $1 LIMIT 1",
    [orderId],
  );
  const order = orderResult.rows[0];
  if (!order) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
  const paymentResult = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::float AS charge_amount,
       COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::float AS refund_amount,
       COALESCE(SUM(amount) FILTER (WHERE status = 'cancelled'), 0)::float AS void_amount,
       COUNT(*)::int AS payment_count
     FROM payments
     WHERE order_id = $1`,
    [orderId],
  );
  const totalAmount = roundMoney(Number(order.total_amount ?? 0));
  const chargeAmount = roundMoney(Number(paymentResult.rows[0]?.charge_amount ?? 0));
  const refundAmount = roundMoney(Number(paymentResult.rows[0]?.refund_amount ?? 0));
  const voidAmount = roundMoney(Number(paymentResult.rows[0]?.void_amount ?? 0));
  const ledger = deriveLedgerSummary({
    orderStatus: order.status,
    orderTotalCents: toCents(totalAmount),
    events: [
      { type: "payment", amountCents: toCents(chargeAmount), status: "valid" },
      { type: "refund", amountCents: toCents(refundAmount), status: "refunded" },
      { type: "void", amountCents: toCents(voidAmount), status: "voided" },
    ],
  });
  return {
    totalAmount,
    paidAmount: centsToAmount(ledger.netPaidCents),
    balance: centsToAmount(ledger.balanceCents),
    paymentStatus: ledger.paymentStatus,
    paymentCount: Number(paymentResult.rows[0]?.payment_count ?? 0),
  };
}

export async function syncOrderPaymentSummary(orderId: number, actor?: AuthUser | null): Promise<PaymentSummary> {
  const before = await pool.query("SELECT id, paid_amount, payment_status, payment_method, paid_at FROM orders WHERE id = $1", [orderId]);
  const summary = await calculateOrderPaymentSummary(orderId);
  const methodResult = await pool.query(
    `SELECT method FROM payments WHERE order_id = $1 AND status = 'paid' ORDER BY created_at DESC, id DESC LIMIT 1`,
    [orderId],
  );
  const paymentMethod = summary.paidAmount > 0 ? methodResult.rows[0]?.method ?? "external" : "unpaid";
  const paidAt = summary.paymentStatus === "paid" ? new Date() : null;
  const updated = await pool.query(
    `UPDATE orders
     SET paid_amount = $1, payment_status = $2, payment_method = $3, paid_at = $4, updated_at = now()
     WHERE id = $5
     RETURNING id, paid_amount, payment_status, payment_method, paid_at`,
    [summary.paidAmount, summary.paymentStatus, paymentMethod, paidAt, orderId],
  );
  await writeAuditLog({
    actor,
    action: "order.payment_summary_recalculated",
    entityType: "order",
    entityId: orderId,
    before: before.rows[0] ?? null,
    after: updated.rows[0] ?? null,
  });
  return summary;
}

export async function getOrderPaymentBundle(orderId: number): Promise<OrderPaymentBundle> {
  const [payments, summary] = await Promise.all([
    listOrderPayments(orderId),
    calculateOrderPaymentSummary(orderId),
  ]);
  return { payments, ...summary };
}

export async function addPayment(input: {
  orderId: number;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  externalReference?: string | null;
  actor?: AuthUser | null;
}): Promise<{ payment: PaymentRecord; summary: PaymentSummary }> {
  await ensurePaymentSchema();
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error("Payment amount must be greater than 0."), { statusCode: 400, code: "PAYMENT_INVALID_AMOUNT" });
  }
  if (!PAYMENT_METHODS.has(input.method)) {
    throw Object.assign(new Error("Invalid payment method."), { statusCode: 400 });
  }
  const order = await pool.query("SELECT id, status, total_amount FROM orders WHERE id = $1 LIMIT 1", [input.orderId]);
  if (!order.rows[0]) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
  if (order.rows[0].status === "cancelled") {
    throw Object.assign(new Error("Cannot add payment to a cancelled order."), { statusCode: 409, code: "ORDER_INVALID_STATE" });
  }
  const currentSummary = await calculateOrderPaymentSummary(input.orderId);
  try {
    assertCanApplyPayment({ amountCents: toCents(amount), balanceCents: toCents(currentSummary.balance) });
  } catch (error: any) {
    throw Object.assign(error instanceof Error ? error : new Error("Invalid payment amount."), {
      statusCode: error?.statusCode ?? 400,
      code: error?.code ?? "PAYMENT_INVALID_AMOUNT",
    });
  }
  const result = await pool.query(
    `INSERT INTO payments (order_id, amount, method, status, note, external_reference, created_by)
     VALUES ($1, $2, $3, 'paid', $4, $5, $6)
     RETURNING *`,
    [input.orderId, amount, input.method, input.note ?? null, input.externalReference ?? null, input.actor?.id ?? null],
  );
  const payment = mapPayment(result.rows[0]);
  const summary = await syncOrderPaymentSummary(input.orderId, input.actor);
  await writeAuditLog({ actor: input.actor, action: "payment.created", entityType: "payment", entityId: payment.id, after: payment });
  return { payment, summary };
}

export async function updatePaymentMetadata(input: {
  paymentId: number;
  note?: string | null;
  externalReference?: string | null;
  actor?: AuthUser | null;
}): Promise<{ payment: PaymentRecord; summary: PaymentSummary }> {
  await ensurePaymentSchema();
  const before = await pool.query("SELECT * FROM payments WHERE id = $1 LIMIT 1", [input.paymentId]);
  if (!before.rows[0]) throw Object.assign(new Error("Payment not found."), { statusCode: 404 });
  const result = await pool.query(
    `UPDATE payments SET note = COALESCE($1, note), external_reference = COALESCE($2, external_reference), updated_at = now()
     WHERE id = $3 RETURNING *`,
    [input.note ?? null, input.externalReference ?? null, input.paymentId],
  );
  const payment = mapPayment(result.rows[0]);
  await writeAuditLog({ actor: input.actor, action: "payment.metadata_updated", entityType: "payment", entityId: input.paymentId, before: before.rows[0], after: result.rows[0] });
  return { payment, summary: await calculateOrderPaymentSummary(payment.orderId) };
}

export async function setPaymentTerminalStatus(input: {
  paymentId: number;
  status: Extract<PaymentStatus, "refunded" | "cancelled">;
  actor?: AuthUser | null;
}): Promise<{ payment: PaymentRecord; summary: PaymentSummary }> {
  await ensurePaymentSchema();
  const before = await pool.query("SELECT * FROM payments WHERE id = $1 LIMIT 1", [input.paymentId]);
  const existing = before.rows[0];
  if (!existing) throw Object.assign(new Error("Payment not found."), { statusCode: 404 });
  if (existing.status === input.status) {
    return { payment: mapPayment(existing), summary: await calculateOrderPaymentSummary(Number(existing.order_id)) };
  }
  if (existing.status !== "paid") {
    throw Object.assign(new Error(`Payment is already ${existing.status}.`), { statusCode: 409 });
  }
  const refundedAt = input.status === "refunded" ? new Date() : null;
  const cancelledAt = input.status === "cancelled" ? new Date() : null;
  const result = await pool.query(
    `UPDATE payments
     SET status = $1, refunded_at = COALESCE($2, refunded_at), cancelled_at = COALESCE($3, cancelled_at), updated_at = now()
     WHERE id = $4 RETURNING *`,
    [input.status, refundedAt, cancelledAt, input.paymentId],
  );
  const payment = mapPayment(result.rows[0]);
  const summary = await syncOrderPaymentSummary(payment.orderId, input.actor);
  await writeAuditLog({ actor: input.actor, action: input.status === "refunded" ? "payment.refunded" : "payment.cancelled", entityType: "payment", entityId: payment.id, before: before.rows[0], after: result.rows[0] });
  return { payment, summary };
}

export async function getPaymentSummary(params: {
  from?: string;
  to?: string;
  date?: string;
  method?: string;
  status?: string;
}) {
  await ensurePaymentSchema();
  const start = params.date ? new Date(`${params.date}T00:00:00.000Z`) : params.from ? new Date(params.from) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const end = params.date ? new Date(`${params.date}T23:59:59.999Z`) : params.to ? new Date(params.to) : new Date();
  const ordersResult = await pool.query(
    `SELECT o.*,
       COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::float AS charge_amount,
       COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'refunded'), 0)::float AS refund_amount,
       COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'cancelled'), 0)::float AS void_amount,
       COUNT(p.id)::int AS payment_count
     FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.created_at >= $1 AND o.created_at <= $2
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [start, end],
  );
  const enriched = ordersResult.rows.map((o) => {
    const totalAmount = roundMoney(Number(o.total_amount ?? 0));
    const ledger = deriveLedgerSummary({
      orderStatus: o.status,
      orderTotalCents: toCents(totalAmount),
      events: [
        { type: "payment", amountCents: toCents(Number(o.charge_amount ?? 0)), status: "valid" },
        { type: "refund", amountCents: toCents(Number(o.refund_amount ?? 0)), status: "refunded" },
        { type: "void", amountCents: toCents(Number(o.void_amount ?? 0)), status: "voided" },
      ],
    });
    return {
      id: Number(o.id),
      type: o.type,
      tableId: o.table_id == null ? null : Number(o.table_id),
      status: o.status,
      paymentStatus: ledger.paymentStatus,
      totalAmount,
      paidAmount: centsToAmount(ledger.netPaidCents),
      balance: centsToAmount(ledger.balanceCents),
      paymentCount: Number(o.payment_count ?? 0),
      createdAt: toIso(o.created_at),
    };
  });
  const activeEnriched = enriched.filter((o) => o.status !== "cancelled");
  const totalReceivable = roundMoney(activeEnriched.reduce((sum, o) => sum + o.totalAmount, 0));
  const totalCollected = roundMoney(activeEnriched.reduce((sum, o) => sum + o.paidAmount, 0));
  const paymentClauses = ["o.status <> 'cancelled'", "p.created_at >= $1", "p.created_at <= $2"];
  const values: unknown[] = [start, end];
  if (params.method && PAYMENT_METHODS.has(params.method as PaymentMethod)) { values.push(params.method); paymentClauses.push(`p.method = $${values.length}`); }
  if (params.status && PAYMENT_STATUSES.has(params.status as PaymentStatus)) { values.push(params.status); paymentClauses.push(`p.status = $${values.length}`); }
  const paymentsResult = await pool.query(
    `SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id WHERE ${paymentClauses.join(" AND ")} ORDER BY p.created_at DESC`,
    values,
  );
  const payments = paymentsResult.rows.map(mapPayment);
  const paidPayments = payments.filter((p) => p.status === "paid");
  const methodTotal = (method: PaymentMethod) => roundMoney(paidPayments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amount, 0));
  const unpaidOrderList = activeEnriched.filter((o) => o.paymentStatus === "unpaid");
  const partiallyPaidOrderList = activeEnriched.filter((o) => o.paymentStatus === "partially_paid");
  const paidOrderList = activeEnriched.filter((o) => o.paymentStatus === "paid");
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    totalReceivable,
    totalCollected,
    totalOutstanding: roundMoney(Math.max(totalReceivable - totalCollected, 0)),
    cashTotal: methodTotal("cash"),
    cardTotal: methodTotal("card"),
    transferTotal: methodTotal("transfer"),
    externalTotal: methodTotal("external"),
    refundedTotal: roundMoney(payments.filter((p) => p.status === "refunded").reduce((sum, p) => sum + p.amount, 0)),
    cancelledPaymentTotal: roundMoney(payments.filter((p) => p.status === "cancelled").reduce((sum, p) => sum + p.amount, 0)),
    unpaidOrders: unpaidOrderList.length,
    partiallyPaidOrders: partiallyPaidOrderList.length,
    paidOrders: paidOrderList.length,
    cancelledOrders: enriched.filter((o) => o.status === "cancelled").length,
    orderCount: activeEnriched.length,
    averageOrderValue: activeEnriched.length ? roundMoney(totalReceivable / activeEnriched.length) : 0,
    unpaidOrderList,
    partiallyPaidOrderList,
    paidOrderList,
    payments,
  };
}
