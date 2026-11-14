import type { orderStatus } from "@/db/schema";
import type { Same } from "@/lib/types";

// Order lifecycle rules (§2.6), with no database access: src/db/order-status.ts loads
// the facts, asks these functions, and writes the change and its history.

export const ORDER_STATUSES = [
  "in_production",
  "ready_for_pickup",
  "docket_raised",
  "in_transit",
  "delivered",
  "on_hold",
  "cancelled",
  "returned",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Fails to compile if this list and the order_status enum drift apart.
const statusesMatch: Same<
  OrderStatus,
  (typeof orderStatus.enumValues)[number]
> = true;
void statusesMatch;

export const STATUS_LABELS: Record<OrderStatus, string> = {
  in_production: "In production",
  ready_for_pickup: "Ready for pickup",
  docket_raised: "Docket raised",
  in_transit: "In transit",
  delivered: "Delivered",
  on_hold: "On hold",
  cancelled: "Cancelled",
  returned: "Returned (RTO)",
};

/** Statuses an order is still being worked on in (not delivered or closed). */
export const OPEN_STATUSES: readonly OrderStatus[] = [
  "in_production",
  "ready_for_pickup",
  "docket_raised",
  "in_transit",
  "on_hold",
];

/** Item production stages can only change while the order is in one of these. */
const STAGE_EDITABLE: readonly OrderStatus[] = ["in_production", "on_hold"];

export type StatusFacts = {
  /** Items in the order, and how many are at their category's last stage. */
  itemCount: number;
  finishedItems: number;
  /** Shipments on the order (§2.7, M6). */
  hasShipment: boolean;
  hasAwb: boolean;
};

export type StatusChange = {
  to: OrderStatus;
  cancelReason?: string | null;
};

/**
 * Why the order can't move from `from` to `to`, or null if it can. Any status may go to
 * any other (corrections are allowed, §2.6), except for these requirements.
 */
export function statusChangeProblem(
  from: OrderStatus,
  change: StatusChange,
  facts: StatusFacts,
): string | null {
  const { to } = change;
  if (from === to)
    return `The order is already ${STATUS_LABELS[to].toLowerCase()}.`;
  const allFinished =
    facts.itemCount > 0 && facts.finishedItems === facts.itemCount;
  switch (to) {
    case "ready_for_pickup":
    case "delivered":
      return allFinished
        ? null
        : `Finish every item first (${facts.finishedItems} of ${facts.itemCount} are at their last stage).`;
    case "docket_raised":
      return facts.hasShipment
        ? null
        : "Add a shipment with its delivery partner first.";
    case "in_transit":
    case "returned":
      return facts.hasAwb ? null : "Add the shipment's AWB number first.";
    case "cancelled":
      return change.cancelReason?.trim()
        ? null
        : "Say why the order is cancelled.";
    case "in_production":
    case "on_hold":
      return null;
  }
}

/** Why item stages can't change now, or null if they can. */
export function stageChangeProblem(status: OrderStatus): string | null {
  return STAGE_EDITABLE.includes(status)
    ? null
    : `Production stages can't change while the order is ${STATUS_LABELS[status].toLowerCase()}. Move it back to In production first.`;
}

export type Stage = { id: string; name: string; position: number };

/** The stage after `currentId` in a category's stages, or null at the last one. */
export function nextStage(stages: Stage[], currentId: string): Stage | null {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((s) => s.id === currentId);
  return index >= 0 ? (ordered[index + 1] ?? null) : null;
}

/** The last (finished) stage of a category. */
export function lastStage(stages: Stage[]): Stage | null {
  return [...stages].sort((a, b) => b.position - a.position)[0] ?? null;
}

/**
 * Overdue: promised date has passed and the order isn't delivered or closed. Due soon:
 * promised within `dueSoonDays` days (§2.6). Dates are "YYYY-MM-DD" in IST.
 */
export function deadlineFlag(
  status: OrderStatus,
  promisedDate: string,
  today: string,
  dueSoonDays: number,
): "overdue" | "due_soon" | null {
  if (!OPEN_STATUSES.includes(status)) return null;
  if (today > promisedDate) return "overdue";
  const days =
    (Date.parse(`${promisedDate}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
    86_400_000;
  return days <= dueSoonDays ? "due_soon" : null;
}
