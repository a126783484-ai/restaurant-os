import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type DatabaseClient = ReturnType<typeof drizzle<typeof schema>>;

type DatabaseGlobalState = {
  pool: pg.Pool | null;
  db: DatabaseClient | null;
  databaseUrl: string | null;
  initError: string | null;
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
};

const state = globalState.__restaurantOsDatabase;

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createDatabaseClient(): DatabaseClient {
  if (!databaseUrl) {
    state.initError = "DATABASE_URL is not configured.";
    throw new Error("DATABASE_URL must be set before using database-backed routes.");
  }

  if (state.db && state.pool && state.databaseUrl === databaseUrl) {
    return state.db;
  }

  // Vercel serverless functions must fail fast. Waiting 10–30 seconds for Supabase
  // pooler connection attempts can turn normal API errors into 504 blank-screen
  // failures. Keep a single connection per instance and a short connection timeout.
  state.pool = new Pool({
    connectionString: databaseUrl,
    max: numberFromEnv("DB_POOL_MAX", 1),
    idleTimeoutMillis: numberFromEnv("DB_IDLE_TIMEOUT_MS", 1_000),
    connectionTimeoutMillis: numberFromEnv("DB_CONNECTION_TIMEOUT_MS", 3_000),
    allowExitOnIdle: true,
    ssl: databaseUrl.includes("supabase.com") || databaseUrl.includes("pooler.supabase.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  state.pool.on("error", (err) => {
    state.initError = err instanceof Error ? err.message : String(err);
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
      throw new Error("Database pool is not initialized.");
    }
    return Reflect.get(state.pool, property, receiver);
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

export function getDatabaseRuntimeStatus() {
  return {
    configured: Boolean(databaseUrl),
    initialized: Boolean(state.db && state.pool),
    poolMax: numberFromEnv("DB_POOL_MAX", 1),
    connectionTimeoutMillis: numberFromEnv("DB_CONNECTION_TIMEOUT_MS", 3_000),
    idleTimeoutMillis: numberFromEnv("DB_IDLE_TIMEOUT_MS", 1_000),
    initError: state.initError,
  };
}

export * from "./schema";
