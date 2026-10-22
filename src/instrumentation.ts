export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { dbMode } = await import("@/db");
  // PGlite: ready automatically. PostgreSQL: run `npm run db:migrate`, or set AUTO_MIGRATE=1.
  if (dbMode === "pglite" || process.env.AUTO_MIGRATE === "1") {
    const { runMigrations } = await import("@/db/migrate");
    await runMigrations();
  }
}
