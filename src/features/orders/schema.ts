import { z } from "zod";
import type { orderChannel } from "@/db/schema";
import { addressShape } from "@/features/customers/schema";
import { MAX_PRICE_PAISE } from "@/features/products/schema";
import { dateOnlyField } from "@/lib/dates";
import { moneyField, parseMoney } from "@/lib/money";
import type { Same } from "@/lib/types";
import { ORDER_STATUSES } from "./lifecycle";
import type { Discount } from "./pricing";
import { parsePercent } from "./pricing";

// The order form (§2.4, §2.5, §3.2): one schema for the browser and the server action.

export const CHANNELS = [
  "instagram",
  "whatsapp",
  "phone",
  "in_person",
  "website",
  "other",
] as const;
export type Channel = (typeof CHANNELS)[number];

// Fails to compile if this list and the order_channel enum drift apart.
const channelsMatch: Same<Channel, (typeof orderChannel.enumValues)[number]> =
  true;
void channelsMatch;

export const CHANNEL_LABELS: Record<Channel, string> = {
  instagram: "Instagram DM",
  whatsapp: "WhatsApp",
  phone: "Phone call",
  in_person: "In person",
  website: "Website",
  other: "Other",
};

export const MAX_QUANTITY = 999;
export const MAX_ITEMS = 50;

/** Trimmed text, or null when left empty. */
function optionalText(max: number) {
  return z
    .string()
    .transform((s) => s.trim())
    .transform((s) => (s === "" ? null : s))
    .pipe(z.string().max(max, `Keep it under ${max} characters`).nullable());
}

const quantityField = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .regex(/^\d{1,3}$/, "Enter a whole number")
      .transform(Number)
      .pipe(
        z
          .number()
          .min(1, "At least 1")
          .max(MAX_QUANTITY, `At most ${MAX_QUANTITY}`),
      ),
  );

const priceField = moneyField().pipe(
  z.number().max(MAX_PRICE_PAISE, "That's more than ₹10,00,000"),
);

/** One chosen customisation: a choice for "choice" options, text for "text" ones. */
export const itemCustomisationSchema = z.object({
  optionId: z.uuid(),
  choiceId: z.uuid().nullable(),
  text: z.string().max(500).nullable(),
});

export type ItemCustomisationInput = z.input<typeof itemCustomisationSchema>;

export const orderItemSchema = z.object({
  /** Present for an item already saved on the order (editing). */
  id: z.uuid().optional(),
  productId: z.uuid(),
  quantity: quantityField,
  unitPrice: priceField,
  notes: optionalText(500),
  customisations: z.array(itemCustomisationSchema).max(20),
});

export type OrderItemInput = z.input<typeof orderItemSchema>;

export const DISCOUNT_TYPES = ["none", "flat", "percent"] as const;

export const orderSchema = z
  .object({
    customerId: z.uuid("Choose a customer"),
    orderDate: dateOnlyField(),
    promisedDate: dateOnlyField(),
    priority: z.enum(["normal", "urgent"]),
    channel: z.enum([...CHANNELS, ""]).transform((v) => (v === "" ? null : v)),
    ...addressShape,
    discountType: z.enum(DISCOUNT_TYPES),
    /** ₹ for a flat discount, % for a percentage; ignored for "none". */
    discountValue: z.string().max(20),
    shippingCharged: priceField,
    notes: optionalText(2000),
    items: z
      .array(orderItemSchema)
      .min(1, "Add at least one item")
      .max(MAX_ITEMS, `At most ${MAX_ITEMS} items`),
  })
  .superRefine((order, ctx) => {
    if (order.promisedDate < order.orderDate) {
      ctx.addIssue({
        code: "custom",
        path: ["promisedDate"],
        message: "Can't be before the order date",
      });
    }
    if (discountOf(order) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message:
          order.discountType === "percent"
            ? "Enter a percentage from 0 to 100, like 10 or 12.5"
            : "Enter an amount like 100 or 99.50",
      });
    }
  })
  .transform(({ discountType, discountValue, ...order }) => ({
    ...order,
    discount: discountOf({ discountType, discountValue }) ?? {
      type: "none" as const,
    },
  }));

export type OrderInput = z.input<typeof orderSchema>;
export type OrderValues = z.output<typeof orderSchema>;

/** The discount the two discount fields describe, or null if the value can't be read. */
export function discountOf(fields: {
  discountType: (typeof DISCOUNT_TYPES)[number];
  discountValue: string;
}): Discount | null {
  switch (fields.discountType) {
    case "none":
      return { type: "none" };
    case "flat": {
      const paise = parseMoney(fields.discountValue);
      return paise !== null && paise >= 0 && paise <= MAX_PRICE_PAISE
        ? { type: "flat", paise }
        : null;
    }
    case "percent": {
      const bp = parsePercent(fields.discountValue);
      return bp === null ? null : { type: "percent", bp };
    }
  }
}

/** Moving order items to other production stages (§2.6). */
export const stageChangeSchema = z.object({
  orderId: z.uuid(),
  items: z
    .array(z.object({ itemId: z.uuid(), stageId: z.uuid() }))
    .min(1)
    .max(MAX_ITEMS),
});

/** Changing an order's status (§2.6). Extra fields depend on the new status. */
export const statusChangeSchema = z
  .object({
    orderId: z.uuid(),
    // "" until a status is chosen (the form starts with nothing selected).
    to: z
      .enum([...ORDER_STATUSES, ""])
      .pipe(z.enum(ORDER_STATUSES, "Choose the new status")),
    note: optionalText(500),
    /** Delivered: when ("" = today). */
    deliveredDate: z.union([dateOnlyField(), z.literal("")]),
    /** Cancelled: why, and whether a refund is owed. */
    cancelReason: optionalText(500),
    refundOwed: z.boolean(),
  })
  .superRefine((change, ctx) => {
    if (change.to === "cancelled" && !change.cancelReason) {
      ctx.addIssue({
        code: "custom",
        path: ["cancelReason"],
        message: "Say why the order is cancelled",
      });
    }
  });

export type StatusChangeFormInput = z.input<typeof statusChangeSchema>;

/** Editing an order: the same form, for an existing order. */
export const updateOrderSchema = z
  .object({ orderId: z.uuid() })
  .and(orderSchema);
