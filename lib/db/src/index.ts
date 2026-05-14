import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type DatabaseClient = ReturnType<typeof drizzle<typeof schema>>;

type DatabaseStrategy = "node-postgres-fail-fast";

type DatabaseGlobalState = {
  pool: pg.Pool | null;
  db: DatabaseClient | null;
  databaseUrl: string | null;
  initError: string | null;
  lastConnectionError: string | null;
  lastConnectionErrorAt: string | null;
  circuitOpenUntil: number | null;
  circuitReason: string | null;
  strategy: DatabaseStrategy;
};

const globalState = globalThis as typeof globalThis & {
  __restaurantOsDatabase?: DatabaseGlobalState;
};

const databaseUrl = process.env.DATABASE_URL ?? null;

globalState.__restaurantOsDatabase ??= {
  pool: null,
  db: null,
  databaseUrl: null,
  initError: null,
  lastConnectionError: null,
  lastConnectionErrorAt: null,
  circuitOpenUntil: null,
  circuitReason: null,
  strategy: "node-postgres-fail-fast",
};

const state = globalState.__restaurantOsDatabase;

export class DatabaseUnavailableError extends Error {
  readonly code = "DATABASE_UNAVAILABLE";
  readonly statusCode = 503;

  constructor(message = "Database unavailable. Please retry shortly.", cause?: unknown) {
    super(message);
    this.name = "DatabaseUnavailableError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function connectionTimeoutMillis(): number {
  return numberFromEnv("DB_CONNECTION_TIMEOUT_MS", 1_500);
}

function idleTimeoutMillis(): number {
  return numberFromEnv("DB_IDLE_TIMEOUT_MS", 1_000);
}

function queryTimeoutMillis(): number {
  return numberFromEnv("DB_QUERY_TIMEOUT_MS", 2_000);
}

function poolMax(): number {
  return numberFromEnv("DB_POOL_MAX", 1);
}

function circuitBreakerMillis(): number {
  return numberFromEnv("DB_CIRCUIT_BREAKER_MS", 15_000);
}

function isDatabaseErrorMessage(message: string): boolean {
  return [
    "ENOTFOUND",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "timeout",
    "tenant/user",
    "password authentication failed",
    "Connection terminated",
    "Database unavailable",
    "DATABASE_URL",
    "database",
  ].some((pattern) => message.includes(pattern));
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof DatabaseUnavailableError) return true;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === "DATABASE_UNAVAILABLE") return true;
  const message = error instanceof Error ? error.message : String(error);
  return isDatabaseErrorMessage(message);
}

function recordDatabaseError(error: unknown): DatabaseUnavailableError {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();
  state.initError = message;
  state.lastConnectionError = message;
  state.lastConnectionErrorAt = now;
  state.circuitOpenUntil = Date.now() + circuitBreakerMillis();
  state.circuitReason = message;
  return error instanceof DatabaseUnavailableError
    ? error
    : new DatabaseUnavailableError("Database unavailable. Please retry shortly.", error);
}

function assertCircuitClosed(): void {
  const openUntil = state.circuitOpenUntil;
  if (openUntil && openUntil > Date.now()) {
    throw new DatabaseUnavailableError(
      `Database unavailable. Circuit breaker is open until ${new Date(openUntil).toISOString()}.`,
    );
  }
  if (openUntil && openUntil <= Date.now()) {
    state.circuitOpenUntil = null;
    state.circuitReason = null;
  }
}

function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = queryTimeoutMillis()): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new DatabaseUnavailableError(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([operation, timeout])
    .then((value) => {
      state.initError = null;
      return value;
    })
    .catch((error) => {
      throw recordDatabaseError(error);
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

function patchPool(poolInstance: pg.Pool): pg.Pool {
  const originalQuery = poolInstance.query.bind(poolInstance) as pg.Pool["query"];
  const originalConnect = poolInstance.connect.bind(poolInstance);

  Object.defineProperty(poolInstance, "query", {
    configurable: true,
    value: (...args: Parameters<pg.Pool["query"]>) => {
      assertCircuitClosed();
      const lastArg = args[args.length - 1];
      if (typeof lastArg === "function") {
        return originalQuery(...args);
      }
      return withTimeout(Promise.resolve(originalQuery(...args) as unknown), "Database query") as unknown;
    },
  });

  Object.defineProperty(poolInstance, "connect", {
    configurable: true,
    value: (...args: Parameters<typeof originalConnect>) => {
      assertCircuitClosed();
      const lastArg = args[args.length - 1];
      if (typeof lastArg === "function") {
        return originalConnect(...args);
      }
      return withTimeout(Promise.resolve(originalConnect(...args)), "Database connect", connectionTimeoutMillis());
    },
  });

  return poolInstance;
}

function createDatabaseClient(): DatabaseClient {
  if (!databaseUrl) {
    state.initError = "DATABASE_URL is not configured.";
    throw new DatabaseUnavailableError("DATABASE_URL is not configured.");
  }

  assertCircuitClosed();

  if (state.db && state.pool && state.databaseUrl === databaseUrl) {
    return state.db;
  }

  // Vercel serverless functions must fail fast. Waiting 10–30 seconds for Supabase
  // pooler connection attempts can turn normal API errors into 504 blank-screen
  // failures. Keep a single connection per instance, short connection/query timeouts,
  // and a circuit breaker so repeated requests recover quickly with structured 503s.
  state.pool = patchPool(new Pool({
    connectionString: databaseUrl,
    max: poolMax(),
    idleTimeoutMillis: idleTimeoutMillis(),
    connectionTimeoutMillis: connectionTimeoutMillis(),
    allowExitOnIdle: true,
    ssl: databaseUrl.includes("supabase.com") || databaseUrl.includes("pooler.supabase.com")
      ? { rejectUnauthorized: false }
      : undefined,
  }));

  state.pool.on("error", (err) => {
    recordDatabaseError(err);
    console.error("Unexpected database pool error", err);
  });

  state.db = drizzle(state.pool, { schema });
  state.databaseUrl = databaseUrl;
  state.initError = null;

  return state.db;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, property, receiver) {
    createDatabaseClient();
    if (!state.pool) {
      throw new DatabaseUnavailableError("Database pool is not initialized.");
    }
    const value = Reflect.get(state.pool, property, receiver);
    return typeof value === "function" ? value.bind(state.pool) : value;
  },
});

export const db = new Proxy({} as DatabaseClient, {
  get(_target, property, receiver) {
    const client = createDatabaseClient();
    return Reflect.get(client, property, receiver);
  },
});

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl);
}

export async function checkDatabaseConnection(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string; latencyMs: number }> {
  const started = Date.now();
  try {
    await pool.query("SELECT 1 AS ok");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    const normalized = recordDatabaseError(error);
    return { ok: false, error: normalized.message, latencyMs: Date.now() - started };
  }
}

export function getDatabaseRuntimeStatus() {
  return {
    strategy: state.strategy,
    configured: Boolean(databaseUrl),
    initialized: Boolean(state.db && state.pool),
    poolMax: poolMax(),
    connectionTimeoutMillis: connectionTimeoutMillis(),
    queryTimeoutMillis: queryTimeoutMillis(),
    idleTimeoutMillis: idleTimeoutMillis(),
    circuitBreakerMillis: circuitBreakerMillis(),
    circuitOpen: Boolean(state.circuitOpenUntil && state.circuitOpenUntil > Date.now()),
    circuitOpenUntil: state.circuitOpenUntil ? new Date(state.circuitOpenUntil).toISOString() : null,
    circuitReason: state.circuitReason,
    initError: state.initError,
    lastConnectionError: state.lastConnectionError,
    lastConnectionErrorAt: state.lastConnectionErrorAt,
  };
}

export * from "./schema";
