import { asc, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * ORDER BY a name, ignoring case: "asha" next to "Asha", not after "Zoya". Collation is
 * no help: the Alpine Postgres image (musl) sorts byte-wise whatever the locale says,
 * and hosts differ. Matches the lower(name) unique indexes. Use for every name sort.
 */
export function byName(column: AnyPgColumn): SQL {
  return asc(sql`lower(${column})`);
}
