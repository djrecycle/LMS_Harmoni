import "./_env";
import fs from "node:fs";
import path from "node:path";

/** Local development only (PGlite): delete ./data/pglite, then recreate the schema (seed afterwards). */
async function main() {
  if (process.env.DATABASE_URL?.trim()) {
    console.error("db:reset is only for local PGlite (DATABASE_URL must be empty).");
    process.exit(1);
  }
  fs.rmSync(path.join(process.cwd(), "data", "pglite"), { recursive: true, force: true });
  console.log("Local data deleted.");
  const { runMigrations } = await import("../src/db/migrate");
  const { closeDb } = await import("../src/db");
  await runMigrations();
  await closeDb();
  console.log("Schema recreated. Run `npm run db:seed` to insert the sample data.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
