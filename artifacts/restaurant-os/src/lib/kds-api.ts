import { customFetch, type OrderDetail } from "@workspace/api-client-react";

export type KdsDataQualityCode =
  | "ACTIVE_ORDER_WITHOUT_ITEMS"
  | "ACTIVE_DINE_IN_WITHOUT_TABLE"
  | "ACTIVE_ORDER_TABLE_NOT_OCCUPIED";

export type KdsOrder = OrderDetail & {
  dataQualityIssue?: boolean;
  dataQualityCode?: KdsDataQualityCode;
  dataQualityMessage?: string;
  tableStatus?: string | null;
};

export type KdsColumn = {
  status: "pending" | "preparing" | "ready";
  orders: KdsOrder[];
};

export type KdsBoardError = {
  code: string;
  message: string;
};

export type KdsBoard = {
  ok: boolean;
  sourceOfTruth: "backend-order-domain";
  activeStatuses: Array<KdsColumn["status"]>;
  total: number;
  columns: KdsColumn[];
  generatedAt: string;
  degraded?: boolean;
  error?: KdsBoardError;
};

function isKdsBoardPayload(value: unknown): value is KdsBoard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<KdsBoard>;
  return (
    candidate.sourceOfTruth === "backend-order-domain" &&
    Array.isArray(candidate.activeStatuses) &&
    Array.isArray(candidate.columns) &&
    typeof candidate.total === "number" &&
    typeof candidate.generatedAt === "string"
  );
}

export async function getKdsBoard() {
  try {
    return await customFetch<KdsBoard>("/api/orders/kds", { method: "GET" });
  } catch (error) {
    const data = error && typeof error === "object" ? (error as { data?: unknown }).data : undefined;
    if (isKdsBoardPayload(data)) {
      return data;
    }
    throw error;
  }
}
