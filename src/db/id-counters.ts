import { sql } from "drizzle-orm";
import type { DateOnly } from "@/lib/dates";
import { formatOrderId, orderIdPrefix } from "@/lib/ids";
import type { Database } from "./connect";
import { idCounters } from "./schema";

// Numbers for readable IDs (lib/ids): customers C-0001, orders HMU-YYMM-#### per month.
//
// Allocation is one INSERT … ON CONFLICT DO UPDATE … RETURNING: Postgres row-locks the
// counter, so concurrent callers always get different numbers. Call it inside the same
// transaction that inserts the customer or order. Then a failed insert rolls the counter
// back too (no gaps), and the lock is held only until that transaction ends.

/** The database, or a transaction from `db.transaction(async (tx) => …)`. */
export type Executor =
  Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

async function nextValue(db: Executor, name: string): Promise<number> {
  const [row] = await db
    .insert(idCounters)
    .values({ name, lastValue: 1 })
    .onConflictDoUpdate({
      target: idCounters.name,
      set: { lastValue: sql`${idCounters.lastValue} + 1` },
    })
    .returning({ value: idCounters.lastValue });
  if (!row) throw new Error(`Counter "${name}" returned no row`);
  return row.value;
}

/** Next customer number (shown as C-0001 with formatCustomerId). */
export function nextCustomerNumber(db: Executor): Promise<number> {
  return nextValue(db, "customer");
}

/** Next order code for the month of `orderDate`, e.g. "HMU-2611-0042". */
export async function nextOrderCode(
  db: Executor,
  orderDate: DateOnly,
): Promise<string> {
  // "HMU-2611" → series "order:2611": numbering restarts each month.
  const series = `order:${orderIdPrefix(orderDate).slice("HMU-".length)}`;
  return formatOrderId(orderDate, await nextValue(db, series));
}
