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

export type KdsBoard = {
  ok: boolean;
  sourceOfTruth: "backend-order-domain";
  activeStatuses: Array<KdsColumn["status"]>;
  total: number;
  columns: KdsColumn[];
  generatedAt: string;
};

export function getKdsBoard() {
  return customFetch<KdsBoard>("/api/orders/kds", { method: "GET" });
}
