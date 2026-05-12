import express from "express";

const app = express();

app.get("/", (_req, res) => res.status(200).json({ ok: true, runtime: "minimal-express" }));
app.get("/health", (_req, res) => res.status(200).json({ ok: true, runtime: "minimal-express" }));

export default app;
