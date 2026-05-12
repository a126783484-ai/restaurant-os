import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { logger } from "./lib/logger";

const app = express();

let routesLoaded = false;
let routesLoadError: string | null = null;

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.originalUrl }, "incoming request");
  next();
});

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    runtime: "alive",
    routesLoaded,
    routesLoadError,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/status", (_req, res) => {
  res.status(routesLoaded ? 200 : 503).json({
    ok: routesLoaded,
    routesLoaded,
    routesLoadError,
    timestamp: new Date().toISOString(),
  });
});

async function loadApplicationRoutes() {
  try {
    const routerModule = await import("./routes");
    app.use("/api", routerModule.default);
    routesLoaded = true;
    logger.info("Application routes loaded");
  } catch (err) {
    routesLoaded = false;
    routesLoadError = err instanceof Error ? err.message : String(err);
    logger.error(err, "Failed to load application routes");
  }
}

void loadApplicationRoutes();

export default app;
