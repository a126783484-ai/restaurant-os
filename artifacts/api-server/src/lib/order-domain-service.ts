export const ACTIVE_DINE_IN_ORDER_STATUSES = ["pending", "preparing", "ready"] as const;
export const KDS_ACTIVE_ORDER_STATUSES = ["pending", "preparing", "ready"] as const;

export type KdsActiveOrderStatus = typeof KDS_ACTIVE_ORDER_STATUSES[number];

export function isKdsActiveOrderStatus(status: string): status is KdsActiveOrderStatus {
  return (KDS_ACTIVE_ORDER_STATUSES as readonly string[]).includes(status);
}

export function groupKdsOrdersByStatus<T extends { status: string }>(orders: T[]) {
  return KDS_ACTIVE_ORDER_STATUSES.map((status) => ({
    status,
    orders: orders.filter((order) => order.status === status),
  }));
}
