import { Router, type IRouter, type Response } from "express";
import { isDatabaseConfigured } from "@workspace/db";
import { getRequestUser } from "../middlewares/auth";
import {
  canManagePayment,
  canViewClosing,
  getPaymentSummary,
  setPaymentTerminalStatus,
  updatePaymentMetadata,
} from "../lib/payment-service";

const router: IRouter = Router();

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    ok: false,
    error: { code, message },
    message,
    timestamp: new Date().toISOString(),
  });
}

function parseId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/payments/summary", async (req, res, next): Promise<void> => {
  const user = getRequestUser(req);
  if (!canViewClosing(user?.role)) {
    sendError(res, 403, "AUTH_FORBIDDEN", "Only admin or manager can view payment closing summaries.");
    return;
  }
  if (!isDatabaseConfigured()) {
    sendError(res, 503, "DATABASE_UNAVAILABLE", "Payment closing summary requires DATABASE_URL.");
    return;
  }
  try {
    const summary = await getPaymentSummary({
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      method: typeof req.query.method === "string" ? req.query.method : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    });
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.patch("/payments/:id", async (req, res, next): Promise<void> => {
  const user = getRequestUser(req);
  if (!canManagePayment(user?.role)) {
    sendError(res, 403, "AUTH_FORBIDDEN", "Only admin or manager can edit payment metadata.");
    return;
  }
  const id = parseId(req.params.id);
  if (!id) {
    sendError(res, 400, "PAYMENT_ID_INVALID", "Payment id must be a positive integer.");
    return;
  }
  try {
    const result = await updatePaymentMetadata({
      paymentId: id,
      note: typeof req.body?.note === "string" || req.body?.note === null ? req.body.note : undefined,
      externalReference:
        typeof req.body?.externalReference === "string" || req.body?.externalReference === null
          ? req.body.externalReference
          : undefined,
      actor: user,
    });
    res.json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, error.code ?? "PAYMENT_UPDATE_FAILED", error.message);
      return;
    }
    next(error);
  }
});

router.post("/payments/:id/refund", async (req, res, next): Promise<void> => {
  const user = getRequestUser(req);
  if (!canManagePayment(user?.role)) {
    sendError(res, 403, "AUTH_FORBIDDEN", "Only admin or manager can refund payments.");
    return;
  }
  const id = parseId(req.params.id);
  if (!id) {
    sendError(res, 400, "PAYMENT_ID_INVALID", "Payment id must be a positive integer.");
    return;
  }
  try {
    res.json(await setPaymentTerminalStatus({ paymentId: id, status: "refunded", actor: user }));
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, error.code ?? "PAYMENT_REFUND_FAILED", error.message);
      return;
    }
    next(error);
  }
});

router.post("/payments/:id/cancel", async (req, res, next): Promise<void> => {
  const user = getRequestUser(req);
  if (!canManagePayment(user?.role)) {
    sendError(res, 403, "AUTH_FORBIDDEN", "Only admin or manager can cancel payments.");
    return;
  }
  const id = parseId(req.params.id);
  if (!id) {
    sendError(res, 400, "PAYMENT_ID_INVALID", "Payment id must be a positive integer.");
    return;
  }
  try {
    res.json(await setPaymentTerminalStatus({ paymentId: id, status: "cancelled", actor: user }));
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, error.code ?? "PAYMENT_CANCEL_FAILED", error.message);
      return;
    }
    next(error);
  }
});

export default router;
