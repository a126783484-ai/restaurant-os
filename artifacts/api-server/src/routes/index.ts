import { Router, type IRouter, type RequestHandler } from "express";
import { getDatabaseRuntimeStatus, isDatabaseConfigured } from "@workspace/db";
import { getOpenAIIntegrationStatus } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireRole, type AuthRole } from "../middlewares/auth";

const router: IRouter = Router();

type RouteModuleKey =
  | "health"
  | "auth"
  | "customers"
  | "tables"
  | "reservations"
  | "products"
  | "orders"
  | "staff"
  | "dashboard"
  | "payments"
  | "inventory"
  | "ai";

type RouteModuleStatus = {
  key: RouteModuleKey;
  paths: string[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadedAt: string | null;
  protected: boolean;
  roles?: AuthRole[];
};

type RouteModuleRecord = {
  key: RouteModuleKey;
  paths: string[];
  load: () => Promise<{ default: IRouter }>;
  router?: IRouter;
  promise?: Promise<IRouter>;
  error: string | null;
  loadedAt: string | null;
  protected?: boolean;
  roles?: AuthRole[];
};

const routeModules: RouteModuleRecord[] = [
  {
    key: "health",
    paths: ["/healthz"],
    protected: false,
    load: () => import("./health"),
    error: null,
    loadedAt: null,
  },
  {
    key: "auth",
    paths: ["/auth"],
    protected: false,
    load: () => import("./auth"),
    error: null,
    loadedAt: null,
  },
  {
    key: "customers",
    paths: ["/customers"],
    protected: true,
    roles: ["admin", "manager", "staff"],
    load: () => import("./customers"),
    error: null,
    loadedAt: null,
  },
  {
    key: "tables",
    paths: ["/tables"],
    protected: true,
    roles: ["admin", "manager", "staff"],
    load: () => import("./tables"),
    error: null,
    loadedAt: null,
  },
  {
    key: "reservations",
    paths: ["/reservations"],
    protected: true,
    roles: ["admin", "manager", "staff"],
    load: () => import("./reservations"),
    error: null,
    loadedAt: null,
  },
  {
    key: "products",
    paths: ["/products"],
    protected: true,
    roles: ["admin", "manager", "staff"],
    load: () => import("./products"),
    error: null,
    loadedAt: null,
  },
  {
    key: "orders",
    paths: ["/orders"],
    protected: true,
    roles: ["admin", "manager", "staff", "kitchen"],
    load: () => import("./orders"),
    error: null,
    loadedAt: null,
  },
  {
    key: "staff",
    paths: ["/staff", "/shifts", "/tasks"],
    protected: true,
    roles: ["admin", "manager"],
    load: () => import("./staff"),
    error: null,
    loadedAt: null,
  },
  {
    key: "dashboard",
    paths: ["/dashboard"],
    protected: true,
    roles: ["admin", "manager", "staff"],
    load: () => import("./dashboard"),
    error: null,
    loadedAt: null,
  },
  {
    key: "payments",
    paths: ["/payments"],
    protected: true,
    roles: ["admin", "manager"],
    load: () => import("./payments"),
    error: null,
    loadedAt: null,
  },
  {
    key: "inventory",
    paths: ["/inventory"],
    protected: true,
    roles: ["admin", "manager", "staff"],
    load: () => import("./inventory"),
    error: null,
    loadedAt: null,
  },
  {
    key: "ai",
    paths: ["/ai"],
    protected: true,
    roles: ["admin", "manager"],
    load: () => import("./ai"),
    error: null,
    loadedAt: null,
  },
];

function getRouteStatus(): RouteModuleStatus[] {
  return routeModules.map((entry) => ({
    key: entry.key,
    paths: entry.paths,
    loaded: Boolean(entry.router),
    loading: Boolean(entry.promise && !entry.router),
    error: entry.error,
    loadedAt: entry.loadedAt,
    protected: Boolean(entry.protected),
    roles: entry.roles,
  }));
}

function findRouteModule(path: string): RouteModuleRecord | undefined {
  return routeModules.find((entry) =>
    entry.paths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
  );
}

async function loadRouteModule(entry: RouteModuleRecord): Promise<IRouter> {
  if (entry.router) return entry.router;

  entry.promise ??= entry
    .load()
    .then((module) => {
      entry.router = module.default;
      entry.error = null;
      entry.loadedAt = new Date().toISOString();
      return entry.router;
    })
    .catch((err) => {
      entry.promise = undefined;
      entry.router = undefined;
      entry.loadedAt = null;
      entry.error = err instanceof Error ? err.message : String(err);
      throw err;
    });

  return entry.promise;
}

router.get("/routes/status", (_req, res) => {
  res.status(200).json({
    ok: true,
    mode: "lazy-route-recovery",
    routes: getRouteStatus(),
    timestamp: new Date().toISOString(),
  });
});

router.get("/system/status", (_req, res) => {
  const database = getDatabaseRuntimeStatus();
  const ai = getOpenAIIntegrationStatus();
  const routeStatus = getRouteStatus();
  const failedRoutes = routeStatus.filter((route) => route.error);
  const coreReady = isDatabaseConfigured() && !database.initError;

  res.status(200).json({
    ok: coreReady && failedRoutes.length === 0,
    service: "restaurant-os-api-server",
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    database: {
      ...database,
      ready: coreReady,
    },
    ai: {
      ...ai,
      ready: ai.configured && !ai.initError,
    },
    routes: {
      mode: "lazy-route-recovery",
      total: routeStatus.length,
      loaded: routeStatus.filter((route) => route.loaded).length,
      loading: routeStatus.filter((route) => route.loading).length,
      failed: failedRoutes.length,
      items: routeStatus,
    },
  });
});

const lazyRouteRecoveryMiddleware: RequestHandler = async (req, res, next) => {
  const entry = findRouteModule(req.path);

  if (!entry) {
    next();
    return;
  }

  try {
    if (entry.protected) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(req, res, (err?: unknown) => err ? reject(err) : resolve());
      });

      if (res.headersSent) return;

      if (entry.roles?.length) {
        await new Promise<void>((resolve, reject) => {
          requireRole(entry.roles)(req, res, (err?: unknown) => err ? reject(err) : resolve());
        });

        if (res.headersSent) return;
      }
    }

    const moduleRouter = await loadRouteModule(entry);
    moduleRouter(req, res, next);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      ok: false,
      route: entry.key,
      error: { code: "ROUTE_MODULE_UNAVAILABLE", message: "Route module failed to load" },
      message,
      timestamp: new Date().toISOString(),
    });
  }
};

router.use(lazyRouteRecoveryMiddleware);

export default router;
