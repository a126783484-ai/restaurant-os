import { Router, type IRouter } from "express";
import { gte, eq, and, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable, customersTable, reservationsTable, visitsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  // Today's orders
  const todayOrders = await db.select().from(ordersTable).where(
    and(gte(ordersTable.createdAt, todayStart), eq(ordersTable.status, "completed"))
  );

  const todaySales = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Week sales
  const weekOrders = await db.select().from(ordersTable).where(
    and(gte(ordersTable.createdAt, weekStart), eq(ordersTable.status, "completed"))
  );
  const weekSales = weekOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Today's customers (unique via visits)
  const todayVisits = await db.select().from(visitsTable).where(gte(visitsTable.visitedAt, todayStart));
  const todayCustomers = new Set(todayVisits.map(v => v.customerId)).size;

  // Repeat customer rate
  const allCustomers = await db.select().from(customersTable);
  const repeatCustomers = allCustomers.filter(c => c.visitCount > 1).length;
  const repeatCustomerRate = allCustomers.length > 0 ? (repeatCustomers / allCustomers.length) * 100 : 0;

  // Pending orders
  const pendingOrders = await db.select().from(ordersTable).where(eq(ordersTable.status, "pending"));

  // Active reservations (pending + confirmed)
  const activeReservations = await db.select().from(reservationsTable).where(
    sql`${reservationsTable.status} IN ('pending', 'confirmed', 'seated')`
  );

  res.json({
    todaySales: Math.round(todaySales * 100) / 100,
    todayOrders: todayOrders.length,
    todayCustomers,
    repeatCustomerRate: Math.round(repeatCustomerRate * 10) / 10,
    pendingOrders: pendingOrders.length,
    activeReservations: activeReservations.length,
    weekSales: Math.round(weekSales * 100) / 100,
  });
});

router.get("/dashboard/top-products", async (_req, res): Promise<void> => {
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

  // Enrich with category
  const products = await db.select().from(productsTable);
  const productMap = new Map(products.map(p => [p.id, p.category]));

  const topProducts = result.map(r => ({
    ...r,
    category: productMap.get(r.productId) ?? "Unknown",
    totalRevenue: Math.round(r.totalRevenue * 100) / 100,
  }));

  res.json(topProducts);
});

router.get("/dashboard/customer-flow", async (_req, res): Promise<void> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const visits = await db.select().from(visitsTable).where(gte(visitsTable.visitedAt, todayStart));

  // Group by hour
  const hourMap: Record<string, number> = {};
  for (let h = 8; h <= 22; h++) {
    const label = `${h.toString().padStart(2, "0")}:00`;
    hourMap[label] = 0;
  }

  for (const visit of visits) {
    const hour = new Date(visit.visitedAt).getHours();
    const label = `${hour.toString().padStart(2, "0")}:00`;
    if (hourMap[label] !== undefined) {
      hourMap[label]++;
    }
  }

  const flow = Object.entries(hourMap).map(([hour, customers]) => ({ hour, customers }));
  res.json(flow);
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
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
  for (const r of recentReservations) {
    activity.push({
      id: `reservation-${r.id}`,
      type: "reservation",
      description: `Reservation for ${r.customerName} — party of ${r.partySize} (${r.status})`,
      amount: null,
      createdAt: r.createdAt.toISOString(),
    });
  }

  const recentCustomers = await db.select().from(customersTable).orderBy(sql`${customersTable.createdAt} DESC`).limit(3);
  for (const c of recentCustomers) {
    activity.push({
      id: `customer-${c.id}`,
      type: "customer",
      description: `New customer: ${c.name}`,
      amount: null,
      createdAt: c.createdAt.toISOString(),
    });
  }

  // Sort by createdAt desc and take top 15
  activity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(activity.slice(0, 15));
});

export default router;
