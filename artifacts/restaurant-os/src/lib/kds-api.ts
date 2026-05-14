import { customFetch, type OrderDetail } from "@workspace/api-client-react";

export type KdsColumn = {
  status: "pending" | "preparing" | "ready";
  orders: OrderDetail[];
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
