import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import { isDatabaseUnavailableError } from "@workspace/db";

import { logger } from "./lib/logger";

const app = express();

let routesLoaded = false;
let routesLoadError: string | null = null;

function isProductionRuntime(): boolean {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? "";
  return nodeEnv === "production" || nodeEnv.includes("production");
}

function getSafeDatabaseUrlDiagnostic() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return { configured: false };

  try {
    const parsed = new URL(raw);
    return {
      configured: true,
      protocol: parsed.protocol,
      username: parsed.username,
      hostname: parsed.hostname,
      port: parsed.port,
      database: parsed.pathname.replace(/^\//, ""),
      isPooler: parsed.hostname.includes("pooler.supabase.com"),
      isDirectSupabase: parsed.hostname.startsWith("db.") && parsed.hostname.endsWith(".supabase.co"),
    };
  } catch {
    return { configured: true, parseError: true };
  }
}

function isDatabaseConnectionError(message: string): boolean {
  return [
    "ENOTFOUND",
    "ECONNREFUSED",
    "timeout",
    "tenant/user",
    "password authentication failed",
    "Connection terminated",
    "database",
  ].some((pattern) => message.includes(pattern));
}

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
    error: { code: "NOT_FOUND", message: "Not Found" },
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
  const message = err instanceof Error ? err.message : String(err);
  const dbError = isDatabaseUnavailableError(err) || isDatabaseConnectionError(message);
  const safeStatusCode = dbError ? 503 : statusCode >= 400 && statusCode < 600 ? statusCode : 500;

  logger.error(
    {
      err,
      method: req.method,
      url: req.originalUrl,
      statusCode: safeStatusCode,
      databaseUrl: getSafeDatabaseUrlDiagnostic(),
    },
    "request failed",
  );

  res.status(safeStatusCode).json({
    ok: false,
    error: {
      code: (err as any)?.code ?? (dbError ? "DATABASE_UNAVAILABLE" : safeStatusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED"),
      message: dbError ? "Database unavailable. Please retry shortly." : safeStatusCode >= 500 ? "Internal Server Error" : message,
    },
    message: dbError || !isProductionRuntime() ? message : undefined,
    diagnostics: dbError ? { databaseUrl: getSafeDatabaseUrlDiagnostic() } : undefined,
    timestamp: new Date().toISOString(),
  });
};

app.use(requestContextMiddleware);
const configuredCorsOrigins = [process.env.CORS_ORIGINS, process.env.FRONTEND_URL]
  .filter(Boolean)
  .join(",")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultCorsOrigins = [
  "https://restaurant-os-restaurant-os-opal.vercel.app",
];

const allowedCorsOrigins = new Set([...defaultCorsOrigins, ...configuredCorsOrigins]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.has(origin) || !isProductionRuntime()) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Correlation-Id", "X-Idempotency-Key"],
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    runtime: "alive",
    routesLoaded,
    routesLoadError,
    databaseUrl: getSafeDatabaseUrlDiagnostic(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/status", (_req, res) => {
  res.status(routesLoaded ? 200 : 503).json({
    ok: routesLoaded,
    routesLoaded,
    routesLoadError,
    databaseUrl: getSafeDatabaseUrlDiagnostic(),
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
        error: { code: "ROUTES_UNAVAILABLE", message: "API routes failed to load" },
        message: routesLoadError,
        databaseUrl: getSafeDatabaseUrlDiagnostic(),
        timestamp: new Date().toISOString(),
      });
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
  }
}

void loadApplicationRoutes();

export default app;
