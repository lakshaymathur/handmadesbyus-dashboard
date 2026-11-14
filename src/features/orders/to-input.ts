import type { CatalogueProduct } from "@/features/products/queries";
import { paiseToInput } from "@/lib/money";
import { percentToInput } from "./pricing";
import type { OrderDetail } from "./queries";
import type { OrderInput, OrderItemInput } from "./schema";

/** The order's own fields as form values (everything but the items). */
function orderFields(order: OrderDetail): Omit<OrderInput, "items"> {
  return {
    customerId: order.customer.id,
    orderDate: order.orderDate,
    promisedDate: order.promisedDate,
    priority: order.priority,
    channel: (order.channel ?? "") as OrderInput["channel"],
    line1: order.address.line1,
    line2: order.address.line2 ?? "",
    landmark: order.address.landmark ?? "",
    city: order.address.city,
    // Stored text; one not in the list (e.g. imported) must be chosen again.
    state: order.address.state as OrderInput["state"],
    pin: order.address.pin,
    discountType: order.discount.type,
    discountValue:
      order.discount.type === "flat"
        ? paiseToInput(order.discount.paise)
        : order.discount.type === "percent"
          ? percentToInput(order.discount.bp)
          : "",
    shippingCharged: paiseToInput(order.shippingCharged),
    notes: order.notes ?? "",
  };
}

/** A saved order as the edit form's starting values (items keep their ids). */
export function orderToInput(order: OrderDetail): OrderInput {
  return {
    ...orderFields(order),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: String(item.quantity),
      unitPrice: paiseToInput(item.unitPrice),
      notes: item.notes ?? "",
      customisations: item.customisations.map((c) => ({
        optionId: c.optionId,
        choiceId: c.choiceId,
        text: c.text,
      })),
    })),
  };
}

/**
 * A new order copied from `order` (§3.2 "Duplicate order"), at today's prices: same
 * customer, address, items, quantities and customisations, as far as the catalogue still
 * offers them. Dates and discount start fresh. `skipped` names what couldn't be copied.
 */
export function duplicateToInput(
  order: OrderDetail,
  catalogue: CatalogueProduct[],
  today: string,
): { input: OrderInput; skipped: string[] } {
  const skipped: string[] = [];
  const items: OrderItemInput[] = [];
  for (const item of order.items) {
    const product = catalogue.find(
      (p) => p.id === item.productId && !p.archived,
    );
    if (!product) {
      skipped.push(item.productName);
      continue;
    }
    const customisations = item.customisations.filter((c) => {
      const option = product.options.find((o) => o.id === c.optionId);
      const ok =
        option !== undefined &&
        (c.choiceId === null ||
          option.choices.some((ch) => ch.id === c.choiceId)) &&
        (option.maxLength === null ||
          (c.text?.length ?? 0) <= option.maxLength);
      if (!ok) skipped.push(`${c.name} on ${item.productName}`);
      return ok;
    });
    items.push({
      productId: product.id,
      quantity: String(item.quantity),
      unitPrice: paiseToInput(product.price), // today's price
      notes: item.notes ?? "",
      customisations: customisations.map((c) => ({
        optionId: c.optionId,
        choiceId: c.choiceId,
        text: c.text,
      })),
    });
  }
  return {
    input: {
      ...orderFields(order),
      orderDate: today,
      promisedDate: "",
      discountType: "none",
      discountValue: "",
      notes: "",
      items,
    },
    skipped,
  };
}
