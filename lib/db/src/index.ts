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

function createDatabaseClient(): DatabaseClient {
  if (!databaseUrl) {
    state.initError = "DATABASE_URL is not configured.";
    throw new Error("DATABASE_URL must be set before using database-backed routes.");
  }

  if (state.db && state.pool && state.databaseUrl === databaseUrl) {
    return state.db;
  }

  state.pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_MAX ?? 3),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000),
    allowExitOnIdle: true,
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
    poolMax: Number(process.env.DB_POOL_MAX ?? 3),
    initError: state.initError,
  };
}

export * from "./schema";
