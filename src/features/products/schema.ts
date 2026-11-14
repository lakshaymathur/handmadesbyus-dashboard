import { z } from "zod";
import { moneyField } from "@/lib/money";
import { optionalCmField, optionalGramsField } from "@/lib/units";

// Zod schemas for the product forms (§2.2), shared by the client form and the actions.

/** ₹10,00,000: far above any handmade product, far below the integer column's limit. */
export const MAX_PRICE_PAISE = 1_000_000_00;

function priceField(label: string) {
  return moneyField().pipe(
    z.number().max(MAX_PRICE_PAISE, `${label} can't be more than ₹10,00,000`),
  );
}

/**
 * Product IDs as people write them on stickers and spreadsheets: letters, digits and
 * - _ . /, stored in capitals ("box-sq-red-01" → "BOX-SQ-RED-01"). Unique ignoring case.
 */
export const skuSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(
    z
      .string()
      .min(1, "Enter a product ID")
      .max(40, "Keep it under 40 characters")
      .regex(
        /^[A-Z0-9][A-Z0-9._/-]*$/,
        "Use letters, numbers and - _ . / (no spaces)",
      ),
  );

/** A product name: like nameSchema but longer ("Hexagon Box – Gold Mandala, large"). */
const productNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z.string().min(1, "Enter a name").max(100, "Keep it under 100 characters"),
  );

/** A managed-list choice from a select: "" for none. */
const optionalId = z
  .union([z.uuid(), z.literal("")])
  .transform((v) => (v === "" ? null : v));

export const productShape = {
  sku: skuSchema,
  name: productNameSchema,
  categoryId: z.uuid("Choose a category"),
  typeId: optionalId,
  colourId: optionalId,
  designId: optionalId,
  length: optionalCmField(),
  width: optionalCmField(),
  height: optionalCmField(),
  weight: optionalGramsField(),
  price: priceField("Price"),
  cost: priceField("Cost"),
  optionIds: z.array(z.uuid()).max(50),
};

export const productSchema = z.object(productShape);

export type ProductInput = z.input<typeof productSchema>;

export const updateProductSchema = z.object({ id: z.uuid(), ...productShape });

export const setArchivedSchema = z.object({
  id: z.uuid(),
  archived: z.boolean(),
});

/** Margin (§2.2): price − cost, and as a % of the price (null when the price is 0). */
export function margin(
  price: number,
  cost: number,
): { paise: number; percent: number | null } {
  return {
    paise: price - cost,
    percent:
      price === 0 ? null : Math.round(((price - cost) / price) * 1000) / 10,
  };
}
