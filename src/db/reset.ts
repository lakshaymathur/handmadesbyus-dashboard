import { sql } from "drizzle-orm";
import { connect } from "./connect";
import { runMigrations } from "./migrate";
import { seed } from "./seed";

// Hosts a reset may wipe: this machine, or the `postgres` service inside docker compose.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOCAL_HOSTS = new Set([...LOOPBACK_HOSTS, "postgres"]);

/**
 * Only databases carrying this comment may be wiped. docker/postgres/init sets it on the
 * local dev and test databases; a production database (even reached through an SSH
 * tunnel on localhost) won't have it.
 */
export const DISPOSABLE_MARKER = "disposable-local";

/** Throws unless `url` points at a local host. First line of defence; see the marker. */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to wipe a non-local database (host "${host}"). Resets and test runs only touch localhost.`,
    );
  }
}

/** Host, port and database name, with defaults filled in and loopback names unified. */
function databaseIdentity(url: string): string {
  const u = new URL(url);
  const host = LOOPBACK_HOSTS.has(u.hostname) ? "loopback" : u.hostname;
  const port = u.port || "5432";
  const name = decodeURIComponent(u.pathname.replace(/^\//, "")) || u.username;
  return `${host}:${port}/${name}`;
}

/** True if two URLs reach the same database (e.g. localhost/app vs 127.0.0.1:5432/app). */
export function isSameDatabase(a: string, b: string): boolean {
  return databaseIdentity(a) === databaseIdentity(b);
}

/**
 * Drops every table, then migrates and (unless `seed: false`) seeds. Only for local
 * databases marked disposable. Integration tests use `seed: false`.
 */
export async function resetDatabase(
  url: string,
  options: { seed?: boolean } = {},
): Promise<void> {
  assertLocalDatabase(url);
  const db = connect(url);
  try {
    const { rows } = await db.execute<{ name: string; comment: string | null }>(
      sql`SELECT current_database() AS name,
                 shobj_description(oid, 'pg_database') AS comment
          FROM pg_database WHERE datname = current_database()`,
    );
    const row = rows[0];
    if (row?.comment !== DISPOSABLE_MARKER) {
      const name = row?.name ?? "this database";
      throw new Error(
        `Refusing to wipe "${name}": it isn't marked as a disposable local database. ` +
          `If it really is local, mark it with: COMMENT ON DATABASE "${name}" IS '${DISPOSABLE_MARKER}';`,
      );
    }
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  } finally {
    await db.$client.end();
  }
  await runMigrations(url);
  if (options.seed ?? true) await seed(url);
}
