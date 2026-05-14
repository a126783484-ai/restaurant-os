import type { calculateOrderPaymentSummary } from "./payment-service";

export type PaymentSummaryCalculator = typeof calculateOrderPaymentSummary;

export type PaymentSummaryUnavailable = {
  paymentSummaryUnavailable: true;
  paymentSummaryErrorCode: string;
  paymentSummaryErrorMessage: string;
};

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  if (error && typeof error === "object" && "statusCode" in error) {
    return `PAYMENT_SUMMARY_${String((error as { statusCode?: unknown }).statusCode ?? "ERROR")}`;
  }
  return "PAYMENT_SUMMARY_UNAVAILABLE";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Payment summary could not be calculated for this order.";
}

function fallbackPaymentStatus(order: Record<string, unknown>): string {
  const value = order.paymentStatus ?? order.payment_status;
  return typeof value === "string" && value ? value : "unpaid";
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export async function attachResilientPaymentSummary<T extends { id: number } & Record<string, unknown>>(
  order: T,
  calculateSummary: PaymentSummaryCalculator,
): Promise<T & Record<string, unknown>> {
  try {
    return {
      ...order,
      ...(await calculateSummary(order.id)),
      paymentSummaryUnavailable: false,
    };
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    const totalAmount = toFiniteNumber(order.totalAmount ?? order.total_amount);
    const paidAmount = toFiniteNumber(order.paidAmount ?? order.paid_amount);
    console.error("[orders] payment summary unavailable", {
      orderId: order.id,
      code,
      message,
    });
    return {
      ...order,
      paidAmount,
      balance: Math.max(totalAmount - paidAmount, 0),
      paymentStatus: fallbackPaymentStatus(order),
      paymentCount: 0,
      paymentSummaryUnavailable: true,
      paymentSummaryErrorCode: code,
      paymentSummaryErrorMessage: message,
    } satisfies T & PaymentSummaryUnavailable & Record<string, unknown>;
  }
}
