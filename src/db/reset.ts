import { sql } from "drizzle-orm";
import { connect } from "./connect";
import { runMigrations } from "./migrate";
import { seed } from "./seed";

// Hosts a reset may wipe: this machine, or the `postgres` service inside docker compose.
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "postgres",
]);

/** Throws unless `url` points at a local database. Guards against wiping a real one. */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to reset a non-local database (host "${host}"). Resets only run against localhost.`,
    );
  }
}

/** Drops every table, then migrates and seeds. Local databases only. */
export async function resetDatabase(url: string): Promise<void> {
  assertLocalDatabase(url);
  const db = connect(url);
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  } finally {
    await db.$client.end();
  }
  await runMigrations(url);
  await seed(url);
}
