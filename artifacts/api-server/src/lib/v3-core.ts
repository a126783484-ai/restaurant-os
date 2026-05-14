export type OrderType = "dine_in" | "takeout";
export type OrderStatus = "open" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentEventType = "payment" | "refund" | "void";
export type PaymentMethod = "cash" | "card" | "transfer" | "external";
export type PaymentEventStatus = "valid" | "voided" | "refunded" | "cancelled" | "paid";
export type DerivedPaymentStatus = "unpaid" | "partially_paid" | "paid" | "refunded" | "cancelled";

export const ORDER_STATUSES: readonly OrderStatus[] = ["open", "preparing", "ready", "completed", "cancelled"];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "card", "transfer", "external"];

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  open: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export class V3DomainError extends Error {
  constructor(public code: string, message: string, public statusCode = 400) {
    super(message);
  }
}

export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const raw = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(raw)) throw new V3DomainError("VALIDATION_ERROR", "Money amount must be finite.");
  return Math.round(raw * 100);
}

export function centsToAmount(cents: number): number {
  if (!Number.isInteger(cents)) throw new V3DomainError("VALIDATION_ERROR", "Canonical money amount must be integer cents.");
  return cents / 100;
}

export function normalizeOrderType(type: unknown): OrderType {
  if (type === "dine_in" || type === "dine-in") return "dine_in";
  if (type === "takeout") return "takeout";
  throw new V3DomainError("VALIDATION_ERROR", "Order type must be dine_in or takeout.");
}

export function dbOrderType(type: unknown): "dine-in" | "takeout" {
  return normalizeOrderType(type) === "dine_in" ? "dine-in" : "takeout";
}

export function normalizeOrderStatus(status: unknown): OrderStatus {
  if (status === "open" || status === "pending") return "open";
  if (status === "preparing" || status === "ready" || status === "completed" || status === "cancelled") return status;
  throw new V3DomainError("ORDER_INVALID_STATE", "Invalid order status.");
}

export function dbOrderStatus(status: unknown): "pending" | "preparing" | "ready" | "completed" | "cancelled" {
  const normalized = normalizeOrderStatus(status);
  return normalized === "open" ? "pending" : normalized;
}

export function assertOrderTransition(from: unknown, to: unknown): void {
  const current = normalizeOrderStatus(from);
  const next = normalizeOrderStatus(to);
  if (current === next) return;
  if (!ORDER_TRANSITIONS[current].includes(next)) {
    throw new V3DomainError("ORDER_INVALID_STATE", `Cannot transition order from ${current} to ${next}.`);
  }
}

export type OrderItemSnapshot = {
  productId: number;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  lineSubtotalCents: number;
  notes?: string | null;
};

export function buildOrderItemSnapshot(input: {
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string | null;
}): OrderItemSnapshot {
  if (!Number.isInteger(input.productId) || input.productId <= 0) {
    throw new V3DomainError("VALIDATION_ERROR", "Product id must be a positive integer.");
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new V3DomainError("VALIDATION_ERROR", "Quantity must be a positive integer.");
  }
  const unitPriceCents = toCents(input.unitPrice);
  if (unitPriceCents < 0) throw new V3DomainError("VALIDATION_ERROR", "Product price cannot be negative.");
  return {
    productId: input.productId,
    productName: input.productName,
    unitPriceCents,
    quantity: input.quantity,
    lineSubtotalCents: unitPriceCents * input.quantity,
    notes: input.notes ?? null,
  };
}

export function calculateOrderTotalCents(items: Array<{ lineSubtotalCents: number }>): number {
  return items.reduce((sum, item) => {
    if (!Number.isInteger(item.lineSubtotalCents)) {
      throw new V3DomainError("VALIDATION_ERROR", "Line subtotal must be integer cents.");
    }
    return sum + item.lineSubtotalCents;
  }, 0);
}

export type LedgerPaymentEvent = {
  type: PaymentEventType;
  method?: PaymentMethod;
  amountCents: number;
  status?: PaymentEventStatus;
};

export type LedgerSummary = {
  orderTotalCents: number;
  chargeCents: number;
  refundCents: number;
  voidCents: number;
  netPaidCents: number;
  balanceCents: number;
  paymentStatus: DerivedPaymentStatus;
  paymentCount: number;
};

function isValidCharge(event: LedgerPaymentEvent): boolean {
  return event.type === "payment" && (event.status === undefined || event.status === "valid" || event.status === "paid");
}

function isValidRefund(event: LedgerPaymentEvent): boolean {
  return event.type === "refund" || event.status === "refunded";
}

function isVoid(event: LedgerPaymentEvent): boolean {
  return event.type === "void" || event.status === "voided" || event.status === "cancelled";
}

export function deriveLedgerSummary(input: {
  orderStatus?: string;
  orderTotalCents: number;
  events: LedgerPaymentEvent[];
}): LedgerSummary {
  if (!Number.isInteger(input.orderTotalCents) || input.orderTotalCents < 0) {
    throw new V3DomainError("VALIDATION_ERROR", "Order total must be non-negative integer cents.");
  }
  let chargeCents = 0;
  let refundCents = 0;
  let voidCents = 0;
  for (const event of input.events) {
    if (!Number.isInteger(event.amountCents) || event.amountCents < 0) {
      throw new V3DomainError("PAYMENT_INVALID_AMOUNT", "Payment event amount must be non-negative integer cents.");
    }
    if (isVoid(event)) voidCents += event.amountCents;
    else if (isValidRefund(event)) refundCents += event.amountCents;
    else if (isValidCharge(event)) chargeCents += event.amountCents;
  }
  const netPaidCents = Math.max(chargeCents - refundCents, 0);
  const balanceCents = Math.max(input.orderTotalCents - netPaidCents, 0);
  const orderStatus = input.orderStatus ? normalizeOrderStatus(input.orderStatus) : "open";
  let paymentStatus: DerivedPaymentStatus;
  if (orderStatus === "cancelled") {
    paymentStatus = netPaidCents === 0 ? "cancelled" : refundCents > 0 ? "refunded" : "partially_paid";
  } else if (netPaidCents === 0) {
    paymentStatus = refundCents > 0 ? "refunded" : "unpaid";
  } else if (netPaidCents < input.orderTotalCents) {
    paymentStatus = "partially_paid";
  } else {
    paymentStatus = "paid";
  }
  return {
    orderTotalCents: input.orderTotalCents,
    chargeCents,
    refundCents,
    voidCents,
    netPaidCents,
    balanceCents,
    paymentStatus,
    paymentCount: input.events.length,
  };
}

export function assertCanApplyPayment(input: { amountCents: number; balanceCents: number }): void {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new V3DomainError("PAYMENT_INVALID_AMOUNT", "Payment amount must be greater than 0.");
  }
  if (input.amountCents > input.balanceCents) {
    throw new V3DomainError("PAYMENT_OVERPAYMENT_NOT_ALLOWED", "Payment amount cannot exceed the remaining balance.");
  }
}

export function formatCurrencyCents(cents: number, symbol = "NT$"): string {
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
