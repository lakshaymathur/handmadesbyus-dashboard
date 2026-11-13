import { sql } from "drizzle-orm";
import type { Executor } from "./connect";

/**
 * Takes a transaction-scoped advisory lock named `key`, waiting for whoever holds it.
 * Serialises writers of one ordered list (adds and moves), including the first add to an
 * empty list, where SELECT … FOR UPDATE has no row to lock. Released at commit/rollback.
 */
export async function lockList(tx: Executor, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}
