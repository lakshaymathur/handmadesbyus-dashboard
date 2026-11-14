import { describe, expect, it } from "vitest";
import {
  deadlineFlag,
  lastStage,
  nextStage,
  ORDER_STATUSES,
  stageChangeProblem,
  statusChangeProblem,
  type StatusFacts,
} from "./lifecycle";

const facts = (overrides: Partial<StatusFacts> = {}): StatusFacts => ({
  itemCount: 2,
  finishedItems: 2,
  hasShipment: false,
  hasAwb: false,
  ...overrides,
});

describe("statusChangeProblem", () => {
  it("allows corrections in any direction when nothing is required", () => {
    expect(
      statusChangeProblem("delivered", { to: "in_production" }, facts()),
    ).toBeNull();
    expect(
      statusChangeProblem("cancelled", { to: "on_hold" }, facts()),
    ).toBeNull();
    expect(
      statusChangeProblem("in_transit", { to: "ready_for_pickup" }, facts()),
    ).toBeNull();
  });

  it("needs every item finished for Ready for pickup and Delivered", () => {
    const halfDone = facts({ finishedItems: 1 });
    expect(
      statusChangeProblem(
        "in_production",
        { to: "ready_for_pickup" },
        halfDone,
      ),
    ).toBe("Finish every item first (1 of 2 are at their last stage).");
    expect(
      statusChangeProblem("in_production", { to: "delivered" }, halfDone),
    ).not.toBeNull();
    expect(
      statusChangeProblem(
        "in_production",
        { to: "ready_for_pickup" },
        facts({ itemCount: 0, finishedItems: 0 }),
      ),
    ).not.toBeNull();
    // Hand-over without a shipment is fine once items are finished.
    expect(
      statusChangeProblem("ready_for_pickup", { to: "delivered" }, facts()),
    ).toBeNull();
  });

  it("needs a shipment for Docket raised and an AWB for In transit / Returned", () => {
    expect(
      statusChangeProblem("ready_for_pickup", { to: "docket_raised" }, facts()),
    ).toMatch(/shipment/);
    expect(
      statusChangeProblem(
        "ready_for_pickup",
        { to: "docket_raised" },
        facts({ hasShipment: true }),
      ),
    ).toBeNull();
    expect(
      statusChangeProblem(
        "docket_raised",
        { to: "in_transit" },
        facts({ hasShipment: true }),
      ),
    ).toMatch(/AWB/);
    expect(
      statusChangeProblem(
        "in_transit",
        { to: "returned" },
        facts({ hasShipment: true, hasAwb: true }),
      ),
    ).toBeNull();
  });

  it("needs a reason to cancel", () => {
    expect(
      statusChangeProblem("in_production", { to: "cancelled" }, facts()),
    ).toMatch(/why/);
    expect(
      statusChangeProblem(
        "in_production",
        { to: "cancelled", cancelReason: "  " },
        facts(),
      ),
    ).not.toBeNull();
    expect(
      statusChangeProblem(
        "in_production",
        { to: "cancelled", cancelReason: "Customer changed mind" },
        facts(),
      ),
    ).toBeNull();
  });

  it("refuses a change to the same status", () => {
    for (const status of ORDER_STATUSES) {
      expect(
        statusChangeProblem(
          status,
          { to: status },
          facts({ hasShipment: true, hasAwb: true }),
        ),
      ).not.toBeNull();
    }
  });
});

describe("stages", () => {
  const stages = [
    { id: "c", name: "Finishing", position: 2 },
    { id: "a", name: "Not started", position: 0 },
    { id: "b", name: "Stitched", position: 1 },
  ];

  it("finds the next and last stage by position", () => {
    expect(nextStage(stages, "a")?.id).toBe("b");
    expect(nextStage(stages, "b")?.id).toBe("c");
    expect(nextStage(stages, "c")).toBeNull();
    expect(nextStage(stages, "missing")).toBeNull();
    expect(lastStage(stages)?.id).toBe("c");
    expect(lastStage([])).toBeNull();
  });

  it("only lets stages change while in production or on hold", () => {
    expect(stageChangeProblem("in_production")).toBeNull();
    expect(stageChangeProblem("on_hold")).toBeNull();
    expect(stageChangeProblem("ready_for_pickup")).toMatch(/Move it back/);
    expect(stageChangeProblem("delivered")).not.toBeNull();
  });
});

describe("deadlineFlag", () => {
  const today = "2026-11-14";
  it("flags open orders past or near their promised date", () => {
    expect(deadlineFlag("in_production", "2026-11-13", today, 3)).toBe(
      "overdue",
    );
    expect(deadlineFlag("in_production", "2026-11-14", today, 3)).toBe(
      "due_soon",
    );
    expect(deadlineFlag("on_hold", "2026-11-17", today, 3)).toBe("due_soon");
    expect(deadlineFlag("in_production", "2026-11-18", today, 3)).toBeNull();
  });

  it("never flags delivered or closed orders", () => {
    for (const status of ["delivered", "cancelled", "returned"] as const) {
      expect(deadlineFlag(status, "2026-01-01", today, 3)).toBeNull();
    }
  });
});
