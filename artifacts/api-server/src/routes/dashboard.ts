import { Router, type IRouter } from "express";
import { gte, eq, sql } from "drizzle-orm";
import { db, isDatabaseConfigured, ordersTable, orderItemsTable, productsTable, customersTable, reservationsTable, visitsTable } from "@workspace/db";
import { getRuntimeCustomerFlow, getRuntimeDashboardSummary, getRuntimeRecentActivity, getRuntimeTopProducts } from "../lib/one-store-runtime";

const router: IRouter = Router();

function startOfDay(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function sevenDaysAgo(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isActiveOrder(order: { status: string }): boolean {
  return order.status !== "cancelled";
}

function countsAsRevenue(order: { status: string; paymentStatus: string }): boolean {
  return order.status === "completed" || order.paymentStatus === "paid";
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.json(getRuntimeDashboardSummary());
    return;
  }

  const today = startOfDay();
  const week = sevenDaysAgo();

  const todayOrders = await db.select().from(ordersTable).where(gte(ordersTable.createdAt, today));
  const activeTodayOrders = todayOrders.filter(isActiveOrder);
  const todaySales = activeTodayOrders.filter(countsAsRevenue).reduce((sum, order) => sum + order.totalAmount, 0);

  const weekOrders = await db.select().from(ordersTable).where(gte(ordersTable.createdAt, week));
  const weekSales = weekOrders.filter((order) => isActiveOrder(order) && countsAsRevenue(order)).reduce((sum, order) => sum + order.totalAmount, 0);

  const todayVisits = await db.select().from(visitsTable).where(gte(visitsTable.visitedAt, today));
  const customerIds = new Set(todayVisits.map((visit) => visit.customerId));
  const visitOrderIds = new Set(todayVisits.map((visit) => visit.orderId).filter(Boolean));

  let orderFallbackCustomers = 0;
  for (const order of activeTodayOrders) {
    if (order.customerId) customerIds.add(order.customerId);
    if (!order.customerId && !visitOrderIds.has(order.id)) orderFallbackCustomers += 1;
  }

  const allCustomers = await db.select().from(customersTable);
  const repeatCustomers = allCustomers.filter((customer) => customer.visitCount > 1).length;
  const repeatCustomerRate = allCustomers.length > 0 ? (repeatCustomers / allCustomers.length) * 100 : 0;
  const pendingOrders = await db.select().from(ordersTable).where(eq(ordersTable.status, "pending"));
  const activeReservations = await db.select().from(reservationsTable).where(sql`${reservationsTable.status} IN ('pending', 'confirmed', 'seated')`);

  res.json({
    todaySales: roundMoney(todaySales),
    todayOrders: activeTodayOrders.length,
    todayCustomers: customerIds.size + orderFallbackCustomers,
    repeatCustomerRate: Math.round(repeatCustomerRate * 10) / 10,
    pendingOrders: pendingOrders.length,
    activeReservations: activeReservations.length,
    weekSales: roundMoney(weekSales),
  });
});

router.get("/dashboard/top-products", async (_req, res): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.json(getRuntimeTopProducts());
    return;
  }

  const result = await db
    .select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      totalSold: sql<number>`SUM(${orderItemsTable.quantity})::integer`,
      totalRevenue: sql<number>`SUM(${orderItemsTable.subtotal})`,
    })
    .from(orderItemsTable)
    .groupBy(orderItemsTable.productId, orderItemsTable.productName)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`)
    .limit(10);

  const products = await db.select().from(productsTable);
  const productMap = new Map(products.map((product) => [product.id, product.category]));

  res.json(result.map((item) => ({
    ...item,
    category: productMap.get(item.productId) ?? "Unknown",
    totalRevenue: roundMoney(item.totalRevenue),
  })));
});

router.get("/dashboard/customer-flow", async (_req, res): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.json(getRuntimeCustomerFlow());
    return;
  }

  const today = startOfDay();
  const visits = await db.select().from(visitsTable).where(gte(visitsTable.visitedAt, today));
  const orders = await db.select().from(ordersTable).where(gte(ordersTable.createdAt, today));
  const visitOrderIds = new Set(visits.map((visit) => visit.orderId).filter(Boolean));

  const hourMap: Record<string, number> = {};
  for (let hour = 8; hour <= 22; hour += 1) {
    hourMap[`${hour.toString().padStart(2, "0")}:00`] = 0;
  }

  for (const visit of visits) {
    const hour = new Date(visit.visitedAt).getHours();
    const label = `${hour.toString().padStart(2, "0")}:00`;
    if (hourMap[label] !== undefined) hourMap[label] += 1;
  }

  for (const order of orders) {
    if (!isActiveOrder(order) || visitOrderIds.has(order.id)) continue;
    const hour = new Date(order.createdAt).getHours();
    const label = `${hour.toString().padStart(2, "0")}:00`;
    if (hourMap[label] !== undefined) hourMap[label] += 1;
  }

  res.json(Object.entries(hourMap).map(([hour, customers]) => ({ hour, customers })));
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.json(getRuntimeRecentActivity());
    return;
  }

  const activity: { id: string; type: string; description: string; amount: number | null; createdAt: string }[] = [];
  const recentOrders = await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} DESC`).limit(5);
  for (const order of recentOrders) {
    activity.push({
      id: `order-${order.id}`,
      type: "order",
      description: `Order #${order.id} — ${order.type} (${order.status})`,
      amount: order.totalAmount,
      createdAt: order.createdAt.toISOString(),
    });
  }

  const recentReservations = await db.select().from(reservationsTable).orderBy(sql`${reservationsTable.createdAt} DESC`).limit(5);
  for (const reservation of recentReservations) {
    activity.push({
      id: `reservation-${reservation.id}`,
      type: "reservation",
      description: `Reservation for ${reservation.customerName} — party of ${reservation.partySize} (${reservation.status})`,
      amount: null,
      createdAt: reservation.createdAt.toISOString(),
    });
  }

  const recentCustomers = await db.select().from(customersTable).orderBy(sql`${customersTable.createdAt} DESC`).limit(3);
  for (const customer of recentCustomers) {
    activity.push({
      id: `customer-${customer.id}`,
      type: "customer",
      description: `New customer: ${customer.name}`,
      amount: null,
      createdAt: customer.createdAt.toISOString(),
    });
  }

  activity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(activity.slice(0, 15));
});

export default router;
