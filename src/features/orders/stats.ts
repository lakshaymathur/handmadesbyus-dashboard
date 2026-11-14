import { OPEN_STATUSES, type OrderStatus } from "./lifecycle";

export type CustomerOrderStats = {
  /** Orders that weren't cancelled. */
  orders: number;
  /** Of which still being worked on (not delivered or closed). */
  open: number;
  /** Σ totals of delivered orders: what counts as revenue (§3.6). */
  lifetimeSpend: number;
  /** Most recent order date (not counting cancelled orders), or null. */
  lastOrderDate: string | null;
};

/** A customer's order totals for their page (§2.1 "Derived"). */
export function customerOrderStats(
  orders: { status: OrderStatus; orderDate: string; total: number }[],
): CustomerOrderStats {
  const counted = orders.filter((o) => o.status !== "cancelled");
  return {
    orders: counted.length,
    open: counted.filter((o) => OPEN_STATUSES.includes(o.status)).length,
    lifetimeSpend: counted
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + o.total, 0),
    lastOrderDate: counted.reduce<string | null>(
      (latest, o) =>
        latest === null || o.orderDate > latest ? o.orderDate : latest,
      null,
    ),
  };
}
