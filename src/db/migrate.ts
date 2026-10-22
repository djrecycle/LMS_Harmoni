import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { db, dbMode } from "./index";

/** Runs the migrations in the ./drizzle folder (idempotent). */
export async function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (dbMode === "pglite") await migratePglite(db as any, { migrationsFolder });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  else await migratePg(db as any, { migrationsFolder });
}
