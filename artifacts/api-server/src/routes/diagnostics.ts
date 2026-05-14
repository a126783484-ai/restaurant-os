import { Router, type IRouter } from "express";
import { isDatabaseConfigured } from "@workspace/db";
import { getConsistencyReport } from "../lib/diagnostics-service";

const router: IRouter = Router();

router.get("/diagnostics/consistency", async (_req, res, next): Promise<void> => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({
      ok: false,
      error: { code: "DATABASE_UNAVAILABLE", message: "Consistency diagnostics require DATABASE_URL." },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    res.json(await getConsistencyReport());
  } catch (error) {
    next(error);
  }
});

export default router;
