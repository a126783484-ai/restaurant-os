import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";

import { logger } from "./lib/logger";

const app = express();

let routesLoaded = false;
let routesLoadError: string | null = null;

const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId =
    req.header("x-request-id") ??
    req.header("x-correlation-id") ??
    crypto.randomUUID();

  res.setHeader("x-request-id", requestId);

  logger.info(
    {
      requestId,
      method: req.method,
      url: req.originalUrl,
      userAgent: req.header("user-agent"),
    },
    "incoming request",
  );

  res.on("finish", () => {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        latencyMs: Math.round(latencyMs * 100) / 100,
      },
      "request completed",
    );
  });

  next();
};

const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not Found",
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
};

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const statusCode =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
        ? err.statusCode
        : 500;
  const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
  const message = err instanceof Error ? err.message : String(err);

  logger.error(
    {
      err,
      method: req.method,
      url: req.originalUrl,
      statusCode: safeStatusCode,
    },
    "request failed",
  );

  res.status(safeStatusCode).json({
    ok: false,
    error: safeStatusCode >= 500 ? "Internal Server Error" : message,
    message: process.env.NODE_ENV === "production" && safeStatusCode >= 500 ? undefined : message,
    timestamp: new Date().toISOString(),
  });
};

app.use(requestContextMiddleware);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
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
    app.use(notFoundHandler);
    app.use(errorHandler);
    routesLoaded = true;
    logger.info("Application routes loaded");
  } catch (err) {
    routesLoaded = false;
    routesLoadError = err instanceof Error ? err.message : String(err);
    logger.error(err, "Failed to load application routes");
    app.use("/api", (_req, res) => {
      res.status(503).json({
        ok: false,
        error: "API routes failed to load",
        message: routesLoadError,
        timestamp: new Date().toISOString(),
      });
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
  }
}

void loadApplicationRoutes();

export default app;
