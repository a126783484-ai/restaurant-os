import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { paymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/payments", async (req, res): Promise<void> => {
  const {
    orderId,
    paymentMethod,
    subtotal,
    discount,
    serviceCharge,
    actualPaid,
  } = req.body;

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      orderId,
      paymentStatus: "paid",
      paymentMethod,
      subtotal,
      discount,
      serviceCharge,
      actualPaid,
    })
    .returning();

  res.json(payment);
});

router.get("/payments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, id));
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  res.json(payment);
});

export default router;
