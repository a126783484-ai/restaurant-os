import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable, customersTable, visitsTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/orders", async (req, res): Promise<void> => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, type, date } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (type) conditions.push(eq(ordersTable.type, type));
  if (date) {
    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59Z`);
    conditions.push(gte(ordersTable.createdAt, startOfDay));
    conditions.push(lte(ordersTable.createdAt, endOfDay));
  }

  const orders = conditions.length > 0
    ? await db.select().from(ordersTable).where(and(...conditions)).orderBy(ordersTable.createdAt)
    : await db.select().from(ordersTable).orderBy(ordersTable.createdAt);

  res.json(orders);
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...orderData } = parsed.data;

  // Calculate total from items
  let totalAmount = 0;
  const enrichedItems = [];
  for (const item of items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }
    const subtotal = product.price * item.quantity;
    totalAmount += subtotal;
    enrichedItems.push({
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      subtotal,
      notes: item.notes ?? null,
    });
  }

  const [order] = await db.insert(ordersTable).values({ ...orderData, totalAmount }).returning();

  // Insert order items
  if (enrichedItems.length > 0) {
    await db.insert(orderItemsTable).values(enrichedItems.map(i => ({ ...i, orderId: order.id })));
  }

  // Create a visit record if customer is linked
  if (orderData.customerId) {
    await db.insert(visitsTable).values({
      customerId: orderData.customerId,
      orderId: order.id,
      amount: totalAmount,
      orderType: orderData.type ?? "dine-in",
    });
    // Update customer stats
    await db.update(customersTable)
      .set({
        visitCount: sql`${customersTable.visitCount} + 1`,
        totalSpend: sql`${customersTable.totalSpend} + ${totalAmount}`,
      })
      .where(eq(customersTable.id, orderData.customerId));
  }

  res.status(201).json(order);
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json({ ...order, items });
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(order);
});

export default router;
