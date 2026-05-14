type RuntimeProduct = {
  id: number;
  name: string;
  price: number;
  category: string;
  available: boolean;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RuntimeTable = {
  id: number;
  number: number;
  capacity: number;
  section: string;
  status: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RuntimeOrderItem = {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string | null;
  createdAt: Date;
};

type RuntimeOrder = {
  id: number;
  customerId?: number | null;
  tableId?: number | null;
  type: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  paidAmount: number;
  totalAmount: number;
  paymentNote?: string | null;
  paidAt?: Date | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RuntimeAudit = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  message: string;
  createdAt: Date;
};

type RuntimeState = {
  products: RuntimeProduct[];
  tables: RuntimeTable[];
  orders: RuntimeOrder[];
  orderItems: RuntimeOrderItem[];
  auditLogs: RuntimeAudit[];
  nextOrderId: number;
  nextOrderItemId: number;
  nextAuditId: number;
};

const globalState = globalThis as typeof globalThis & {
  __restaurantOsOneStoreRuntime?: RuntimeState;
};

globalState.__restaurantOsOneStoreRuntime ??= {
  products: [
    {
      id: 1,
      name: "招牌牛肉麵",
      price: 180,
      category: "主餐",
      available: true,
      description: "MVP 預設品項",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: "滷肉飯",
      price: 80,
      category: "主餐",
      available: true,
      description: "MVP 預設品項",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      name: "燙青菜",
      price: 60,
      category: "小菜",
      available: true,
      description: "MVP 預設品項",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 4,
      name: "紅茶",
      price: 35,
      category: "飲品",
      available: true,
      description: "MVP 預設品項",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  tables: [
    {
      id: 1,
      number: 1,
      capacity: 2,
      section: "main",
      status: "available",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      number: 2,
      capacity: 4,
      section: "main",
      status: "available",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      number: 3,
      capacity: 4,
      section: "main",
      status: "available",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  orders: [],
  orderItems: [],
  auditLogs: [],
  nextOrderId: 1,
  nextOrderItemId: 1,
  nextAuditId: 1,
};

const state = globalState.__restaurantOsOneStoreRuntime;

function serializeDate<T extends Record<string, unknown>>(item: T): T {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T;
}

export function listRuntimeProducts(category?: string) {
  return state.products
    .filter((product) => !category || product.category === category)
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    )
    .map(serializeDate);
}

export function listRuntimeTables() {
  return state.tables.sort((a, b) => a.number - b.number).map(serializeDate);
}

export function createRuntimeTable(input: {
  number: number;
  capacity: number;
  section?: string;
  notes?: string | null;
}) {
  if (state.tables.some((table) => table.number === input.number)) {
    throw Object.assign(new Error("Table number already exists."), {
      statusCode: 409,
      code: "TABLE_NUMBER_EXISTS",
    });
  }
  const table = {
    id: Math.max(0, ...state.tables.map((entry) => entry.id)) + 1,
    number: input.number,
    capacity: input.capacity,
    section: input.section ?? "main",
    status: "available",
    notes: input.notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies RuntimeTable;
  state.tables.push(table);
  return serializeDate(table);
}

export function updateRuntimeTable(id: number, patch: Record<string, unknown>) {
  const table = state.tables.find((entry) => entry.id === id);
  if (!table) return null;
  if (typeof patch.status === "string") table.status = patch.status;
  if (typeof patch.capacity === "number") table.capacity = patch.capacity;
  if (typeof patch.section === "string") table.section = patch.section;
  if (typeof patch.notes === "string" || patch.notes === null)
    table.notes = patch.notes as string | null;
  table.updatedAt = new Date();
  return serializeDate(table);
}

export function deleteRuntimeTable(id: number) {
  const activeOrder = state.orders.find(
    (order) =>
      order.tableId === id &&
      ["pending", "preparing", "ready"].includes(order.status),
  );
  if (activeOrder) {
    throw Object.assign(
      new Error("Table has active orders and cannot be deleted."),
      { statusCode: 409, code: "TABLE_HAS_ACTIVE_ORDERS" },
    );
  }
  const index = state.tables.findIndex((table) => table.id === id);
  if (index === -1) return false;
  state.tables.splice(index, 1);
  return true;
}

export function listRuntimeOrders(
  filters: { status?: string; type?: string; date?: string } = {},
) {
  return state.orders
    .filter((order) => !filters.status || order.status === filters.status)
    .filter((order) => !filters.type || order.type === filters.type)
    .filter(
      (order) =>
        !filters.date ||
        order.createdAt.toISOString().slice(0, 10) === filters.date,
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(serializeDate);
}

export function getRuntimeOrder(id: number) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return null;
  return {
    ...serializeDate(order),
    items: state.orderItems
      .filter((item) => item.orderId === id)
      .map(serializeDate),
  };
}

function addAudit(
  entityType: string,
  entityId: number,
  action: string,
  message: string,
): void {
  state.auditLogs.push({
    id: state.nextAuditId++,
    entityType,
    entityId,
    action,
    message,
    createdAt: new Date(),
  });
}

function derivePaymentStatus(paidAmount: number, totalAmount: number): string {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount < totalAmount) return "partially_paid";
  return "paid";
}

function buildItems(
  orderId: number,
  items: Array<{ productId: number; quantity: number; notes?: string | null }>,
) {
  return items.map((item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    if (!product)
      throw Object.assign(new Error(`Product ${item.productId} not found`), {
        statusCode: 400,
      });
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const subtotal = Math.round(product.price * quantity * 100) / 100;
    return {
      id: state.nextOrderItemId++,
      orderId,
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      subtotal,
      notes: item.notes ?? null,
      createdAt: new Date(),
    } satisfies RuntimeOrderItem;
  });
}

export function createRuntimeOrder(input: {
  customerId?: number | null;
  tableId?: number | null;
  type: string;
  notes?: string | null;
  items: Array<{ productId: number; quantity: number; notes?: string | null }>;
  idempotencyKey?: string | null;
}) {
  if (input.idempotencyKey) {
    const existing = state.orders.find(
      (order) => order.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return getRuntimeOrder(existing.id);
  }

  const orderId = state.nextOrderId++;
  const items = buildItems(orderId, input.items);
  const totalAmount =
    Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
  const order: RuntimeOrder = {
    id: orderId,
    customerId: input.customerId ?? null,
    tableId: input.tableId ?? null,
    type: input.type || "dine-in",
    status: "pending",
    paymentStatus: "unpaid",
    paymentMethod: "unpaid",
    paidAmount: 0,
    totalAmount,
    paymentNote: null,
    paidAt: null,
    notes: input.notes ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  state.orders.push(order);
  state.orderItems.push(...items);
  addAudit("order", order.id, "created", `Order #${order.id} created`);
  return getRuntimeOrder(order.id);
}

export function updateRuntimeOrder(id: number, patch: Record<string, unknown>) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return null;

  if (Array.isArray(patch.items)) {
    const items = buildItems(
      id,
      patch.items as Array<{
        productId: number;
        quantity: number;
        notes?: string | null;
      }>,
    );
    state.orderItems = state.orderItems.filter((item) => item.orderId !== id);
    state.orderItems.push(...items);
    order.totalAmount =
      Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) /
      100;
    addAudit("order", id, "items_updated", `Order #${id} items updated`);
  }

  for (const key of [
    "status",
    "paymentStatus",
    "paymentMethod",
    "notes",
    "paymentNote",
  ] as const) {
    if (typeof patch[key] === "string") (order as any)[key] = patch[key];
  }
  if (typeof patch.tableId === "number" || patch.tableId === null)
    order.tableId = patch.tableId as number | null;
  if (typeof patch.paidAmount === "number") {
    order.paidAmount = Math.max(0, Math.round(patch.paidAmount * 100) / 100);
    if (
      !["refunded", "cancelled"].includes(
        String(patch.paymentStatus ?? order.paymentStatus),
      )
    ) {
      order.paymentStatus = derivePaymentStatus(
        order.paidAmount,
        order.totalAmount,
      );
      order.paidAt = order.paymentStatus === "paid" ? new Date() : null;
    }
  }
  if (typeof patch.paidAt === "string") order.paidAt = new Date(patch.paidAt);
  if (patch.paymentStatus === "paid") {
    order.paidAmount = Math.max(order.paidAmount, order.totalAmount);
    order.paidAt = new Date();
  }
  if (patch.paymentStatus === "unpaid") {
    order.paidAmount = 0;
    order.paidAt = null;
  }
  if (patch.paymentStatus === "cancelled") {
    order.paidAt = null;
  }
  order.updatedAt = new Date();
  addAudit("order", id, "updated", `Order #${id} updated`);
  return getRuntimeOrder(id);
}

export function getRuntimeDashboardSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = state.orders.filter(
    (order) => order.createdAt.toISOString().slice(0, 10) === today,
  );
  const activeTodayOrders = todayOrders.filter(
    (order) => order.status !== "cancelled",
  );
  const completed = activeTodayOrders.filter(
    (order) => order.status === "completed",
  );
  const paid = activeTodayOrders.filter(
    (order) => order.paymentStatus === "paid",
  );
  const partiallyPaid = activeTodayOrders.filter(
    (order) => order.paymentStatus === "partially_paid",
  );
  const todayReceivable = activeTodayOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0,
  );
  const todayCollected = activeTodayOrders.reduce((sum, order) => {
    if (order.paymentStatus === "paid")
      return sum + (order.paidAmount || order.totalAmount);
    if (order.paymentStatus === "partially_paid") return sum + order.paidAmount;
    return sum;
  }, 0);
  const weekCollected = state.orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => {
      if (order.paymentStatus === "paid")
        return sum + (order.paidAmount || order.totalAmount);
      if (order.paymentStatus === "partially_paid")
        return sum + order.paidAmount;
      return sum;
    }, 0);
  return {
    todaySales: Math.round(todayCollected * 100) / 100,
    todayReceivable: Math.round(todayReceivable * 100) / 100,
    todayCollected: Math.round(todayCollected * 100) / 100,
    todayOutstanding:
      Math.round(Math.max(todayReceivable - todayCollected, 0) * 100) / 100,
    todayOrders: activeTodayOrders.length,
    todayCustomers: 0,
    repeatCustomerRate: 0,
    pendingOrders: activeTodayOrders.filter(
      (order) => order.status === "pending",
    ).length,
    activeReservations: 0,
    weekSales: Math.round(weekCollected * 100) / 100,
    preparingOrders: activeTodayOrders.filter(
      (order) => order.status === "preparing",
    ).length,
    readyOrders: activeTodayOrders.filter((order) => order.status === "ready")
      .length,
    completedOrders: completed.length,
    unpaidOrders: activeTodayOrders.filter(
      (order) => order.paymentStatus === "unpaid",
    ).length,
    partiallyPaidOrders: partiallyPaid.length,
    paidOrders: paid.length,
  };
}

export function getRuntimeTopProducts() {
  const totals = new Map<
    number,
    {
      productId: number;
      productName: string;
      totalSold: number;
      totalRevenue: number;
      category: string;
    }
  >();
  for (const item of state.orderItems) {
    const product = state.products.find((entry) => entry.id === item.productId);
    const current = totals.get(item.productId) ?? {
      productId: item.productId,
      productName: item.productName,
      totalSold: 0,
      totalRevenue: 0,
      category: product?.category ?? "Unknown",
    };
    current.totalSold += item.quantity;
    current.totalRevenue =
      Math.round((current.totalRevenue + item.subtotal) * 100) / 100;
    totals.set(item.productId, current);
  }
  return [...totals.values()]
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 10);
}

export function getRuntimeCustomerFlow() {
  return Array.from({ length: 15 }, (_, index) => {
    const hour = index + 8;
    return { hour: `${hour.toString().padStart(2, "0")}:00`, customers: 0 };
  });
}

export function getRuntimeRecentActivity() {
  const orderActivity = state.orders.slice(-10).map((order) => ({
    id: `order-${order.id}`,
    type: "order",
    description: `Order #${order.id} — ${order.type} (${order.status}, ${order.paymentStatus})`,
    amount: order.totalAmount,
    createdAt: order.createdAt.toISOString(),
  }));
  const auditActivity = state.auditLogs.slice(-10).map((audit) => ({
    id: `audit-${audit.id}`,
    type: "audit",
    description: audit.message,
    amount: null,
    createdAt: audit.createdAt.toISOString(),
  }));
  return [...orderActivity, ...auditActivity]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 15);
}
