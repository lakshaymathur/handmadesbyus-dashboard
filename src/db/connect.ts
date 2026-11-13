import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** Opens a connection pool to `url`. Call `db.$client.end()` when a script is done with it. */
export function connect(url: string) {
  const pool = new Pool({ connectionString: url, max: 10 });
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof connect>;

/** The database, or a transaction from `db.transaction(async (tx) => …)`. */
export type Executor =
  Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
