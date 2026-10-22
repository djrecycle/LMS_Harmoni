import "./_env";

async function main() {
  const { runMigrations } = await import("../src/db/migrate");
  const { closeDb, dbMode } = await import("../src/db");
  await runMigrations();
  console.log(`Migration completed (${dbMode === "pglite" ? "local PGlite (./data/pglite)" : "PostgreSQL"}).`);
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
