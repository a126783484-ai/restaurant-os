import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

export const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : null;

export const db = pool
  ? drizzle(pool, { schema })
  : new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
      get() {
        throw new Error(
          "DATABASE_URL must be set before using database-backed routes.",
        );
      },
    });

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl);
}

export * from "./schema";
