export type StructuredApiError = {
  ok?: false;
  error?: {
    code?: unknown;
    message?: unknown;
  } | unknown;
  message?: unknown;
};

function getNestedApiMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as StructuredApiError;
  if (record.error && typeof record.error === "object") {
    const message = (record.error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return null;
}

export function getSafeErrorMessage(error: unknown, fallback = "系統暫時無法連線，請稍後再試。") {
  if (error && typeof error === "object" && "data" in error) {
    const message = getNestedApiMessage((error as { data?: unknown }).data);
    if (message) return message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
