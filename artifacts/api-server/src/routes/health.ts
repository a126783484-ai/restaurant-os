import express from "express";

const router = express.Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
