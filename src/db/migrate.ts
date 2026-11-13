import { existsSync } from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connect } from "./connect";

// Paths are relative to the repo root: npm scripts and Vitest both run from there.
export const MIGRATIONS_FOLDER = path.resolve("src/db/migrations");

/** Applies any pending migrations from src/db/migrations to the database at `url`. */
export async function runMigrations(url: string): Promise<void> {
  if (!existsSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) {
    console.log(
      "No migrations yet: run `npm run db:generate` after adding tables.",
    );
    return;
  }
  const db = connect(url);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end();
  }
}
