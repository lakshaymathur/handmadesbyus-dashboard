// Vitest global setup for the integration project: runs once per `npm run test:integration`.
// Wipes the test database and applies every migration fresh, so the schema always matches
// src/db/migrations, even if a migration was regenerated during development.
import { assertLocalDatabase, isSameDatabase, resetDatabase } from "../reset";

/** Drizzle wraps driver errors, so look for ECONNREFUSED anywhere in the `cause` chain. */
function isConnectionRefused(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === "ECONNREFUSED") return true;
  }
  return false;
}

export default async function setup(): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set (copy .env.example to .env).",
    );
  }
  assertLocalDatabase(testUrl);
  const devUrl = process.env.DEV_DATABASE_URL;
  if (devUrl && isSameDatabase(testUrl, devUrl)) {
    throw new Error(
      "TEST_DATABASE_URL points at the same database as DATABASE_URL. Tests wipe it, so use a separate database.",
    );
  }

  try {
    await resetDatabase(testUrl, { seed: false });
  } catch (error) {
    if (isConnectionRefused(error)) {
      throw new Error(
        "Can't reach the test Postgres. Start it with `docker compose up -d --wait`.",
      );
    }
    throw error;
  }
}
