"use server";

import { asc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { Executor } from "@/db/connect";
import { nextOrderCode } from "@/db/id-counters";
import { recordOrderCreated } from "@/db/order-status";
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
import { orderTotals } from "./pricing";
import { orderSchema, type OrderValues } from "./schema";

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
async function prepareItems(
  tx: Executor,
  items: ItemValues[],
  allowArchived: ReadonlySet<string> = new Set(),
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
    const seen = new Set<string>();
    const customisations: PreparedItem["customisations"] = [];
    for (const chosen of item.customisations) {
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
      categoryId: product.categoryId,
      unitCost: product.cost,
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
