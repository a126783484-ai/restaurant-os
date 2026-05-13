import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, productsTable } from "@workspace/db";
import { listRuntimeProducts } from "../lib/one-store-runtime";
import {
  ListProductsQueryParams,
  CreateProductBody,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category } = parsed.data;

  if (!isDatabaseConfigured()) {
    res.json(listRuntimeProducts(category));
    return;
  }

  const products = category
    ? await db.select().from(productsTable).where(eq(productsTable.category, category)).orderBy(productsTable.name)
    : await db.select().from(productsTable).orderBy(productsTable.category, productsTable.name);

  res.json(products);
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, price, category } = parsed.data;
  if (!name || typeof price !== "number" || !category) {
    res.status(400).json({ error: "name, price, and category are required" });
    return;
  }

  const data: typeof productsTable.$inferInsert = {
    name,
    price,
    category,
    description: parsed.data.description,
    available: parsed.data.available,
  };

  const [product] = await db.insert(productsTable).values(data).returning();
  res.status(201).json(product);
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db.update(productsTable).set(parsed.data).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(product);
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
