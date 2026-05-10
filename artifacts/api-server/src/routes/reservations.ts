import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, reservationsTable } from "@workspace/db";
import {
  ListReservationsQueryParams,
  CreateReservationBody,
  GetReservationParams,
  UpdateReservationParams,
  UpdateReservationBody,
  DeleteReservationParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reservations", async (req, res): Promise<void> => {
  const parsed = ListReservationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date, status } = parsed.data;

  const conditions = [];
  if (date) {
    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59Z`);
    conditions.push(gte(reservationsTable.reservedAt, startOfDay));
    conditions.push(lte(reservationsTable.reservedAt, endOfDay));
  }
  if (status) {
    conditions.push(eq(reservationsTable.status, status));
  }

  const reservations = conditions.length > 0
    ? await db.select().from(reservationsTable).where(and(...conditions)).orderBy(reservationsTable.reservedAt)
    : await db.select().from(reservationsTable).orderBy(reservationsTable.reservedAt);

  res.json(reservations);
});

router.post("/reservations", async (req, res): Promise<void> => {
  const parsed = CreateReservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = {
    ...parsed.data,
    reservedAt: new Date(parsed.data.reservedAt),
  };
  const [reservation] = await db.insert(reservationsTable).values(data).returning();
  res.status(201).json(reservation);
});

router.get("/reservations/:id", async (req, res): Promise<void> => {
  const params = GetReservationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [reservation] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, params.data.id));
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  res.json(reservation);
});

router.patch("/reservations/:id", async (req, res): Promise<void> => {
  const params = UpdateReservationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateReservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.reservedAt) {
    updateData.reservedAt = new Date(parsed.data.reservedAt);
  }
  const [reservation] = await db.update(reservationsTable).set(updateData).where(eq(reservationsTable.id, params.data.id)).returning();
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  res.json(reservation);
});

router.delete("/reservations/:id", async (req, res): Promise<void> => {
  const params = DeleteReservationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [reservation] = await db.delete(reservationsTable).where(eq(reservationsTable.id, params.data.id)).returning();
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
