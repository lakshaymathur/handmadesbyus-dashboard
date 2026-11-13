import { sql } from "drizzle-orm";
import type { Database } from "../connect";

/** Empties every table in the `public` schema and restarts ID sequences. Test databases only. */
export async function truncateAllTables(db: Database): Promise<void> {
  const { rows } = await db.execute<{ name: string }>(
    sql`SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `public.${r.name}`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}
