import { describe, expect, it } from "vitest";
import { customerOrderStats } from "./stats";

describe("customerOrderStats", () => {
  it("counts orders, open ones, delivered spend and the last order date", () => {
    expect(
      customerOrderStats([
        { status: "delivered", orderDate: "2026-09-01", total: 100_000 },
        { status: "delivered", orderDate: "2026-10-05", total: 50_000 },
        { status: "in_production", orderDate: "2026-11-10", total: 70_000 },
        { status: "returned", orderDate: "2026-10-20", total: 30_000 },
        { status: "cancelled", orderDate: "2026-11-12", total: 90_000 },
      ]),
    ).toEqual({
      orders: 4, // cancelled doesn't count
      open: 1,
      lifetimeSpend: 150_000, // delivered only (returned and open don't)
      lastOrderDate: "2026-11-10", // not the cancelled one
    });
  });

  it("is all zeros for a customer without orders", () => {
    expect(customerOrderStats([])).toEqual({
      orders: 0,
      open: 0,
      lifetimeSpend: 0,
      lastOrderDate: null,
    });
  });
});
