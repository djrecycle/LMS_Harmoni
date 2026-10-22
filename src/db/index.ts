import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Global = typeof globalThis & {
  __harmoni?: { db: Db; mode: "pglite" | "pg"; close: () => Promise<void> };
  __harmoniShutdownRegistered?: boolean;
};

/**
 * One connection per process (safe against Next.js hot reload).
 *  - With DATABASE_URL    -> regular PostgreSQL (production).
 *  - Without DATABASE_URL -> PGlite (embedded PostgreSQL) in ./data/pglite, no installation needed.
 */
function create() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
    return {
      db: drizzlePg(pool, { schema }) as unknown as Db,
      mode: "pg" as const,
      close: () => pool.end(),
    };
  }
  // `next build` imports this module in several parallel workers; PGlite must not open the same data folder
  // from multiple processes, so during the build it runs purely in memory (nothing is queried at build time).
  const building = process.env.NEXT_PHASE === "phase-production-build";
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pglite");
  if (!building) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = building ? new PGlite() : new PGlite(dir);
  return {
    db: drizzlePglite(client, { schema }) as unknown as Db,
    mode: "pglite" as const,
    close: () => client.close(),
  };
}

const g = globalThis as Global;
g.__harmoni ??= create();

// PGlite runs its own Postgres inside WASM: if the process is killed without closing it
// first, the WAL can be left mid-write and unrecoverable on the next start (no pg_resetwal
// bundled). Closing on SIGINT/SIGTERM lets it checkpoint and shut down cleanly.
if (!g.__harmoniShutdownRegistered) {
  g.__harmoniShutdownRegistered = true;
  const shutdown = (signal: NodeJS.Signals) => {
    const timeout = setTimeout(() => process.exit(1), 5000).unref();
    g.__harmoni!.close()
      .catch((err) => console.error(`Error closing database on ${signal}:`, err))
      .finally(() => {
        clearTimeout(timeout);
        process.exit(0);
      });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

export const db: Db = g.__harmoni.db;
export const dbMode = g.__harmoni.mode;
export const closeDb = () => g.__harmoni!.close();
export { schema };
