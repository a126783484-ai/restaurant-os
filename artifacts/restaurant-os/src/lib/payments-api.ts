import { customFetch } from "@workspace/api-client-react";

export type PaymentMethod = "cash" | "card" | "transfer" | "external";
export type PaymentStatus = "paid" | "refunded" | "cancelled";

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
  paymentStatus: string;
  paymentCount: number;
};

export type OrderPaymentBundle = PaymentSummary & { payments: PaymentRecord[] };

export type ClosingOrder = {
  id: number;
  type: string;
  tableId: number | null;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  paymentCount: number;
  createdAt: string;
};

export type ClosingSummary = {
  from: string;
  to: string;
  totalReceivable: number;
  totalCollected: number;
  totalOutstanding: number;
  cashTotal: number;
  cardTotal: number;
  transferTotal: number;
  externalTotal: number;
  refundedTotal: number;
  cancelledPaymentTotal: number;
  unpaidOrders: number;
  partiallyPaidOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  orderCount: number;
  averageOrderValue: number;
  unpaidOrderList: ClosingOrder[];
  partiallyPaidOrderList: ClosingOrder[];
  paidOrderList: ClosingOrder[];
  payments: PaymentRecord[];
};

export function getOrderPayments(orderId: number) {
  return customFetch<OrderPaymentBundle>(`/api/orders/${orderId}/payments`, { method: "GET" });
}

export function addOrderPayment(orderId: number, data: { amount: number; method: PaymentMethod; note?: string; externalReference?: string }) {
  return customFetch<{ payment: PaymentRecord; summary: PaymentSummary; order: unknown }>(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function refundPayment(paymentId: number) {
  return customFetch<{ payment: PaymentRecord; summary: PaymentSummary }>(`/api/payments/${paymentId}/refund`, { method: "POST" });
}

export function cancelPayment(paymentId: number) {
  return customFetch<{ payment: PaymentRecord; summary: PaymentSummary }>(`/api/payments/${paymentId}/cancel`, { method: "POST" });
}

export function updatePayment(paymentId: number, data: { note?: string | null; externalReference?: string | null }) {
  return customFetch<{ payment: PaymentRecord; summary: PaymentSummary }>(`/api/payments/${paymentId}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function getClosingSummary(params?: { date?: string; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const query = qs.toString();
  return customFetch<ClosingSummary>(`/api/payments/summary${query ? `?${query}` : ""}`, { method: "GET" });
}
