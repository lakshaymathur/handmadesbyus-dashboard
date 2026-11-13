import { sql } from "drizzle-orm";
import type { Database } from "./connect";

/**
 * Marks a local database whose data may be thrown away. docker/postgres/init sets it on
 * the local dev and test databases; a production database (even reached through an SSH
 * tunnel on localhost) won't have it. `db:reset` refuses unmarked databases, and the seed
 * refuses the example password on them.
 */
export const DISPOSABLE_MARKER = "disposable-local";

/** The connected database's name, and whether it carries DISPOSABLE_MARKER. */
export async function describeDatabase(
  db: Database,
): Promise<{ name: string; disposable: boolean }> {
  const { rows } = await db.execute<{ name: string; comment: string | null }>(
    sql`SELECT current_database() AS name,
               shobj_description(oid, 'pg_database') AS comment
        FROM pg_database WHERE datname = current_database()`,
  );
  const row = rows[0];
  return {
    name: row?.name ?? "this database",
    disposable: row?.comment === DISPOSABLE_MARKER,
  };
}
