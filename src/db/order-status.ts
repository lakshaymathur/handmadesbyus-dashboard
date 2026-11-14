import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  stageChangeProblem,
  statusChangeProblem,
  type OrderStatus,
} from "@/features/orders/lifecycle";
import { todayIST, type DateOnly } from "@/lib/dates";
import type { Executor } from "./connect";
import {
  orderItems,
  orders,
  productionStages,
  shipments,
  statusHistory,
} from "./schema";

// The one place order status and item production stages change (CLAUDE.md, §2.6). Each
// change locks the order, checks the lifecycle rules (features/orders/lifecycle.ts) and
// writes a status_history row. Call these inside the caller's transaction.

/** A rule stopped the change; the message is written for the person who tried it. */
export class OrderRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderRuleError";
  }
}

const GONE = "That order no longer exists. Reload the page.";

/** Locks the order row for the rest of the transaction and returns its status. */
async function lockOrder(tx: Executor, orderId: string): Promise<OrderStatus> {
  const [row] = await tx
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!row) throw new OrderRuleError(GONE);
  return row.status;
}

/** What the lifecycle rules need to know about an order (its items and shipments). */
async function statusFacts(tx: Executor, orderId: string) {
  const [items] = await tx
    .select({
      itemCount: sql<number>`count(*)::int`,
      finishedItems: sql<number>`count(*) FILTER (WHERE ${productionStages.position} = (
        SELECT max(p.position) FROM ${productionStages} p
        WHERE p.category_id = ${orderItems.categoryId}
      ))::int`,
    })
    .from(orderItems)
    .innerJoin(
      productionStages,
      eq(productionStages.id, orderItems.productionStageId),
    )
    .where(eq(orderItems.orderId, orderId));
  const [shipping] = await tx
    .select({
      hasShipment: sql<boolean>`count(*) > 0`,
      hasAwb: sql<boolean>`count(*) FILTER (WHERE ${isNotNull(shipments.awb)}) > 0`,
    })
    .from(shipments)
    .where(eq(shipments.orderId, orderId));
  return {
    itemCount: items?.itemCount ?? 0,
    finishedItems: items?.finishedItems ?? 0,
    hasShipment: shipping?.hasShipment ?? false,
    hasAwb: shipping?.hasAwb ?? false,
  };
}

/** Records a new order's first status (call right after inserting it). */
export async function recordOrderCreated(
  tx: Executor,
  { orderId, userId }: { orderId: string; userId: string },
): Promise<void> {
  await tx.insert(statusHistory).values({
    orderId,
    toStatus: "in_production",
    createdBy: userId,
    updatedBy: userId,
  });
}

export type StatusChangeInput = {
  orderId: string;
  to: OrderStatus;
  userId: string;
  note?: string | null;
  /** Delivered: the date it was delivered (default today, IST). Revenue counts on it. */
  deliveredDate?: DateOnly | null;
  /** Cancelled: why (required), and whether a refund is owed. */
  cancelReason?: string | null;
  refundOwed?: boolean;
};

/**
 * Moves an order to another status (§2.6) and records it. Delivered sets the delivered
 * date and leaving Delivered clears it (orders_delivered_date CHECK); Cancelled stores the
 * reason and whether a refund is owed. Throws OrderRuleError when a rule says no.
 */
export async function changeOrderStatus(
  tx: Executor,
  input: StatusChangeInput,
): Promise<void> {
  const from = await lockOrder(tx, input.orderId);
  const problem = statusChangeProblem(
    from,
    { to: input.to, cancelReason: input.cancelReason },
    await statusFacts(tx, input.orderId),
  );
  if (problem) throw new OrderRuleError(problem);

  const cancelReason = input.cancelReason?.trim() || null;
  await tx
    .update(orders)
    .set({
      status: input.to,
      deliveredDate:
        input.to === "delivered" ? (input.deliveredDate ?? todayIST()) : null,
      ...(input.to === "cancelled"
        ? { cancelReason, refundOwed: input.refundOwed ?? false }
        : {}),
      updatedBy: input.userId,
    })
    .where(eq(orders.id, input.orderId));
  await tx.insert(statusHistory).values({
    orderId: input.orderId,
    fromStatus: from,
    toStatus: input.to,
    note:
      input.note?.trim() || (input.to === "cancelled" ? cancelReason : null),
    createdBy: input.userId,
    updatedBy: input.userId,
  });
}

export type StageChangeInput = {
  orderId: string;
  /** Items to move, each to a stage of its own category. */
  items: { itemId: string; stageId: string }[];
  userId: string;
};

/**
 * Moves order items to other production stages (forward or back) and records each move.
 * Only while the order is In production or On hold. Items already at the stage are left
 * alone. Throws OrderRuleError when a rule says no.
 */
export async function setItemStages(
  tx: Executor,
  input: StageChangeInput,
): Promise<void> {
  const status = await lockOrder(tx, input.orderId);
  const problem = stageChangeProblem(status);
  if (problem) throw new OrderRuleError(problem);

  for (const { itemId, stageId } of input.items) {
    const [item] = await tx
      .select({
        categoryId: orderItems.categoryId,
        stageId: orderItems.productionStageId,
      })
      .from(orderItems)
      .where(
        and(eq(orderItems.id, itemId), eq(orderItems.orderId, input.orderId)),
      );
    if (!item) {
      throw new OrderRuleError(
        "That item is no longer on the order. Reload the page.",
      );
    }
    if (item.stageId === stageId) continue;
    const [stage] = await tx
      .select({ id: productionStages.id })
      .from(productionStages)
      .where(
        and(
          eq(productionStages.id, stageId),
          eq(productionStages.categoryId, item.categoryId),
        ),
      );
    if (!stage) {
      throw new OrderRuleError(
        "That stage isn't one of this item's category stages. Reload the page.",
      );
    }
    await tx
      .update(orderItems)
      .set({ productionStageId: stageId, updatedBy: input.userId })
      .where(eq(orderItems.id, itemId));
    await tx.insert(statusHistory).values({
      orderId: input.orderId,
      orderItemId: itemId,
      fromStageId: item.stageId,
      toStageId: stageId,
      createdBy: input.userId,
      updatedBy: input.userId,
    });
  }
}
