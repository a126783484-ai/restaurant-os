import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tablesTable } from "@workspace/db";
import {
  CreateTableBody,
  UpdateTableParams,
  UpdateTableBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tables", async (_req, res): Promise<void> => {
  const tables = await db.select().from(tablesTable).orderBy(tablesTable.number);
  res.json(tables);
});

router.post("/tables", async (req, res): Promise<void> => {
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { number, capacity, section, notes } = parsed.data;
  if (typeof number !== "number" || typeof capacity !== "number") {
    res.status(400).json({ error: "Table number and capacity are required" });
    return;
  }

  const [table] = await db
    .insert(tablesTable)
    .values({
      number,
      capacity,
      section: section ?? "main",
      notes,
    })
    .returning();
  res.status(201).json(table);
});

router.patch("/tables/:id", async (req, res): Promise<void> => {
  const params = UpdateTableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [table] = await db.update(tablesTable).set(parsed.data).where(eq(tablesTable.id, params.data.id)).returning();
  if (!table) {
    res.status(404).json({ error: "Table not found" });
    return;
  }
  res.json(table);
});

export default router;
