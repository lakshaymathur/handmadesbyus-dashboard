"use server";

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { Executor } from "@/db/connect";
import { nextOrderCode } from "@/db/id-counters";
import {
  changeOrderStatus,
  OrderRuleError,
  recordOrderCreated,
  setItemStages,
} from "@/db/order-status";
import {
  customers,
  customisationChoices,
  customisationOptions,
  orderItemCustomisations,
  orderItems,
  orders,
  productCustomisationOptions,
  productionStages,
  products,
} from "@/db/schema";
import { ActionError, authedAction } from "@/lib/auth/action";
import { todayIST } from "@/lib/dates";
import { stageChangeProblem } from "./lifecycle";
import { orderTotals } from "./pricing";
import {
  orderSchema,
  stageChangeSchema,
  statusChangeSchema,
  updateOrderSchema,
  type OrderValues,
} from "./schema";

// Orders (§2.4, §2.5, §3.2). Items snapshot the product's price and cost and each
// customisation's price and cost when they're added (CLAUDE.md: snapshots); the delivery
// address is copied onto the order.

type ItemValues = OrderValues["items"][number];

export type PreparedItem = {
  input: ItemValues;
  categoryId: string;
  unitCost: number;
  /** The category's first production stage: where a new item starts. */
  firstStageId: string;
  customisations: {
    optionId: string;
    choiceId: string | null;
    textValue: string | null;
    price: number;
    cost: number;
  }[];
};

/**
 * Checks each item against the catalogue and snapshots what a new item needs: the
 * product exists (and is active, unless `allowArchived` has it), each customisation is
 * offered by that product with a fitting value. Errors are reported per item
 * ("items.2.customisations").
 */
/** What an item already on the order keeps when the order is edited (its snapshots). */
type SavedItem = {
  categoryId: string;
  unitCost: number;
  customisations: PreparedItem["customisations"];
};

async function prepareItems(
  tx: Executor,
  items: ItemValues[],
  {
    allowArchived = new Set<string>(),
    saved = () => undefined,
  }: {
    allowArchived?: ReadonlySet<string>;
    /** The saved item at this position in `items`, when editing an order. */
    saved?: (index: number) => SavedItem | undefined;
  } = {},
): Promise<PreparedItem[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const [productRows, offered] = await Promise.all([
    tx
      .select({
        id: products.id,
        categoryId: products.categoryId,
        cost: products.cost,
        archivedAt: products.archivedAt,
      })
      .from(products)
      .where(inArray(products.id, productIds)),
    tx
      .select({
        productId: productCustomisationOptions.productId,
        optionId: customisationOptions.id,
        name: customisationOptions.name,
        inputType: customisationOptions.inputType,
        maxLength: customisationOptions.maxLength,
        extraPrice: customisationOptions.extraPrice,
        extraCost: customisationOptions.extraCost,
        active: customisationOptions.active,
      })
      .from(productCustomisationOptions)
      .innerJoin(
        customisationOptions,
        eq(customisationOptions.id, productCustomisationOptions.optionId),
      )
      .where(inArray(productCustomisationOptions.productId, productIds)),
  ]);
  const optionIds = [...new Set(offered.map((o) => o.optionId))];
  const categoryIds = [...new Set(productRows.map((p) => p.categoryId))];
  const [choiceRows, stageRows] = await Promise.all([
    optionIds.length === 0
      ? []
      : tx
          .select({
            id: customisationChoices.id,
            optionId: customisationChoices.optionId,
            active: customisationChoices.active,
          })
          .from(customisationChoices)
          .where(inArray(customisationChoices.optionId, optionIds)),
    categoryIds.length === 0
      ? []
      : tx
          .select({
            id: productionStages.id,
            categoryId: productionStages.categoryId,
          })
          .from(productionStages)
          .where(inArray(productionStages.categoryId, categoryIds))
          .orderBy(asc(productionStages.position)),
  ]);

  const fieldErrors: Record<string, string[]> = {};
  const prepared: PreparedItem[] = [];
  for (const [index, item] of items.entries()) {
    const fail = (field: string, message: string) => {
      fieldErrors[`items.${index}.${field}`] ??= [message];
    };
    const product = productRows.find((p) => p.id === item.productId);
    if (!product || (product.archivedAt && !allowArchived.has(product.id))) {
      fail("productId", "That product isn't available any more. Remove it.");
      continue;
    }
    const firstStage = stageRows.find(
      (s) => s.categoryId === product.categoryId,
    );
    if (!firstStage) {
      fail(
        "productId",
        "Its category has no production stages. Add one in Settings.",
      );
      continue;
    }
    const savedItem = saved(index);
    const seen = new Set<string>();
    const customisations: PreparedItem["customisations"] = [];
    for (const chosen of item.customisations) {
      // Unchanged on an existing item: keep it as saved, even if Settings has since
      // changed or retired the option (snapshots, CLAUDE.md).
      const kept = savedItem?.customisations.find(
        (c) =>
          c.optionId === chosen.optionId &&
          c.choiceId === (chosen.choiceId ?? null) &&
          c.textValue === (chosen.text?.trim() || null),
      );
      if (kept && !seen.has(kept.optionId)) {
        seen.add(kept.optionId);
        customisations.push(kept);
        continue;
      }
      const option = offered.find(
        (o) => o.productId === product.id && o.optionId === chosen.optionId,
      );
      if (!option || !option.active || seen.has(chosen.optionId)) {
        fail(
          "customisations",
          "A customisation isn't offered any more. Edit the item.",
        );
        break;
      }
      seen.add(chosen.optionId);
      const text = chosen.text?.trim() || null;
      let choiceId: string | null = null;
      if (option.inputType === "choice") {
        const choice = choiceRows.find(
          (c) => c.id === chosen.choiceId && c.optionId === option.optionId,
        );
        if (!choice || !choice.active) {
          fail(
            "customisations",
            `Choose a ${option.name.toLowerCase()} option.`,
          );
          break;
        }
        choiceId = choice.id;
      } else if (option.inputType === "text") {
        if (!text) {
          fail(
            "customisations",
            `Enter the ${option.name.toLowerCase()} text.`,
          );
          break;
        }
        if (option.maxLength !== null && text.length > option.maxLength) {
          fail(
            "customisations",
            `${option.name} text can be at most ${option.maxLength} characters.`,
          );
          break;
        }
      }
      customisations.push({
        optionId: option.optionId,
        choiceId,
        textValue: option.inputType === "text" ? text : null,
        price: option.extraPrice,
        cost: option.extraCost,
      });
    }
    prepared.push({
      input: item,
      // An existing item keeps its own category (its stage belongs to it) and cost.
      categoryId: savedItem?.categoryId ?? product.categoryId,
      unitCost: savedItem?.unitCost ?? product.cost,
      firstStageId: firstStage.id,
      customisations,
    });
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ActionError("Please check the items.", fieldErrors);
  }
  return prepared;
}

/** A flat discount can't be more than the items cost (§2.4). */
function checkDiscount(order: OrderValues, items: PreparedItem[]) {
  if (order.discount.type !== "flat") return;
  const { subtotal } = orderTotals({
    items: items.map((i) => ({
      quantity: i.input.quantity,
      unitPrice: i.input.unitPrice,
      unitCost: i.unitCost,
      customisations: i.customisations,
    })),
    discount: { type: "none" },
    shippingCharged: 0,
  });
  if (order.discount.paise > subtotal) {
    throw new ActionError("The discount is more than the items cost.", {
      discountValue: ["Can't be more than the items' total"],
    });
  }
}

/** The order's own columns from the form (everything but the code and items). */
function orderColumns(order: OrderValues) {
  return {
    customerId: order.customerId,
    orderDate: order.orderDate,
    promisedDate: order.promisedDate,
    priority: order.priority,
    channel: order.channel,
    discountType: order.discount.type === "none" ? null : order.discount.type,
    discountFlat: order.discount.type === "flat" ? order.discount.paise : 0,
    discountPercentBp:
      order.discount.type === "percent" ? order.discount.bp : 0,
    shippingCharged: order.shippingCharged,
    deliveryLine1: order.line1,
    deliveryLine2: order.line2,
    deliveryLandmark: order.landmark,
    deliveryCity: order.city,
    deliveryState: order.state,
    deliveryPin: order.pin,
    notes: order.notes,
  };
}

/** Inserts prepared items (and their customisations) at the given positions. */
async function insertItems(
  tx: Executor,
  orderId: string,
  items: { prepared: PreparedItem; position: number }[],
  audit: { createdBy: string; updatedBy: string },
) {
  for (const { prepared, position } of items) {
    const [row] = await tx
      .insert(orderItems)
      .values({
        orderId,
        productId: prepared.input.productId,
        categoryId: prepared.categoryId,
        productionStageId: prepared.firstStageId,
        position,
        quantity: prepared.input.quantity,
        unitPrice: prepared.input.unitPrice,
        unitCost: prepared.unitCost,
        notes: prepared.input.notes,
        ...audit,
      })
      .returning({ id: orderItems.id });
    if (!row) throw new Error("Order item insert returned no row");
    if (prepared.customisations.length > 0) {
      await tx.insert(orderItemCustomisations).values(
        prepared.customisations.map((c) => ({
          orderItemId: row.id,
          ...c,
          ...audit,
        })),
      );
    }
  }
}

/** Creates an order (code HMU-YYMM-#### from its order date), then opens it. */
export const createOrder = authedAction(
  orderSchema,
  async (order, { audit, user }) => {
    const id = await db.transaction(async (tx) => {
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, order.customerId));
      if (!customer) {
        throw new ActionError("That customer no longer exists.", {
          customerId: ["Choose the customer again"],
        });
      }
      const items = await prepareItems(tx, order.items);
      checkDiscount(order, items);
      const [row] = await tx
        .insert(orders)
        .values({
          code: await nextOrderCode(tx, order.orderDate),
          ...orderColumns(order),
          ...audit.create,
        })
        .returning({ id: orders.id });
      if (!row) throw new Error("Order insert returned no row");
      await insertItems(
        tx,
        row.id,
        items.map((prepared, position) => ({ prepared, position })),
        audit.create,
      );
      await recordOrderCreated(tx, { orderId: row.id, userId: user.id });
      return row.id;
    });
    redirect(`/orders/${id}`);
  },
);

/** Runs a lifecycle change; a rule's refusal becomes a message for the person. */
async function asRuleError<T>(change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (error instanceof OrderRuleError) throw new ActionError(error.message);
    throw error;
  }
}

/** Moves items to other production stages (forward or back), recording each move. */
export const changeItemStages = authedAction(
  stageChangeSchema,
  async ({ orderId, items }, { user }) => {
    await asRuleError(() =>
      db.transaction((tx) =>
        setItemStages(tx, { orderId, items, userId: user.id }),
      ),
    );
    refresh();
  },
);

/** Moves the order to another status (§2.6), recording it in the history. */
export const changeStatus = authedAction(
  statusChangeSchema,
  async (change, { user }) => {
    const deliveredDate = change.deliveredDate || todayIST();
    if (change.to === "delivered" && deliveredDate > todayIST()) {
      throw new ActionError("The delivered date can't be in the future.", {
        deliveredDate: ["Can't be after today"],
      });
    }
    await asRuleError(() =>
      db.transaction((tx) =>
        changeOrderStatus(tx, {
          orderId: change.orderId,
          to: change.to,
          userId: user.id,
          note: change.note,
          deliveredDate,
          cancelReason: change.cancelReason,
          refundOwed: change.refundOwed,
        }),
      ),
    );
    refresh();
  },
);

/**
 * Saves changes to an order (§3.2: edit any field, add/remove/edit items). The code and
 * status don't change here. Existing items keep their unit cost, category, stage and
 * unchanged customisation snapshots; new items and new customisations take today's
 * prices. Items can only be added while the order is In production or On hold (a new
 * item starts at its first stage).
 */
export const updateOrder = authedAction(
  updateOrderSchema,
  async ({ orderId, ...order }, { audit }) => {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      if (!current) {
        throw new ActionError("That order no longer exists. Reload the page.");
      }
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, order.customerId));
      if (!customer) {
        throw new ActionError("That customer no longer exists.", {
          customerId: ["Choose the customer again"],
        });
      }

      const savedRows = await tx
        .select({
          id: orderItems.id,
          productId: orderItems.productId,
          categoryId: orderItems.categoryId,
          unitCost: orderItems.unitCost,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const savedExtras =
        savedRows.length === 0
          ? []
          : await tx
              .select({
                itemId: orderItemCustomisations.orderItemId,
                optionId: orderItemCustomisations.optionId,
                choiceId: orderItemCustomisations.choiceId,
                textValue: orderItemCustomisations.textValue,
                price: orderItemCustomisations.price,
                cost: orderItemCustomisations.cost,
              })
              .from(orderItemCustomisations)
              .where(
                inArray(
                  orderItemCustomisations.orderItemId,
                  savedRows.map((r) => r.id),
                ),
              );

      // Items that say they're saved must be this order's, with the same product.
      for (const [index, item] of order.items.entries()) {
        if (!item.id) continue;
        const saved = savedRows.find((r) => r.id === item.id);
        if (!saved || saved.productId !== item.productId) {
          throw new ActionError(
            "This order changed meanwhile. Reload the page.",
            {
              [`items.${index}.productId`]: ["Reload the page and try again"],
            },
          );
        }
      }
      if (
        order.items.some((i) => !i.id) &&
        stageChangeProblem(current.status) !== null
      ) {
        throw new ActionError(
          "Items can only be added while the order is In production or On hold. Move it back first.",
          { items: ["Move the order back to In production to add items"] },
        );
      }

      const items = await prepareItems(tx, order.items, {
        allowArchived: new Set(savedRows.map((r) => r.productId)),
        saved: (index) => {
          const id = order.items[index]?.id;
          const row = savedRows.find((r) => r.id === id);
          return row
            ? {
                categoryId: row.categoryId,
                unitCost: row.unitCost,
                customisations: savedExtras
                  .filter((e) => e.itemId === row.id)
                  .map(({ itemId: _item, ...e }) => e),
              }
            : undefined;
        },
      });
      checkDiscount(order, items);

      await tx
        .update(orders)
        .set({ ...orderColumns(order), ...audit.update })
        .where(eq(orders.id, orderId));

      // Remove items no longer on the order (their history keeps the order).
      const keptIds = order.items.flatMap((i) => (i.id ? [i.id] : []));
      await tx
        .delete(orderItems)
        .where(
          and(
            eq(orderItems.orderId, orderId),
            keptIds.length > 0 ? notInArray(orderItems.id, keptIds) : undefined,
          ),
        );

      const added: { prepared: PreparedItem; position: number }[] = [];
      for (const [position, prepared] of items.entries()) {
        const id = prepared.input.id;
        if (!id) {
          added.push({ prepared, position });
          continue;
        }
        await tx
          .update(orderItems)
          .set({
            quantity: prepared.input.quantity,
            unitPrice: prepared.input.unitPrice,
            notes: prepared.input.notes,
            position,
            ...audit.update,
          })
          .where(eq(orderItems.id, id));
        // Customisations: keep unchanged rows as they are; replace the rest.
        const unchanged = prepared.customisations.filter((c) =>
          savedExtras.some(
            (e) =>
              e.itemId === id &&
              e.optionId === c.optionId &&
              e.choiceId === c.choiceId &&
              e.textValue === c.textValue,
          ),
        );
        await tx.delete(orderItemCustomisations).where(
          and(
            eq(orderItemCustomisations.orderItemId, id),
            unchanged.length > 0
              ? notInArray(
                  orderItemCustomisations.optionId,
                  unchanged.map((c) => c.optionId),
                )
              : undefined,
          ),
        );
        const changed = prepared.customisations.filter(
          (c) => !unchanged.includes(c),
        );
        if (changed.length > 0) {
          await tx
            .insert(orderItemCustomisations)
            .values(
              changed.map((c) => ({ orderItemId: id, ...c, ...audit.create })),
            );
        }
      }
      await insertItems(tx, orderId, added, audit.create);
    });
    redirect(`/orders/${orderId}`);
  },
);
