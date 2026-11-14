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

/** §2.2: up to 5 photos; the first is the thumbnail. */
export const MAX_PHOTOS = 5;

/** Photos are shrunk in the browser first (~0.3–1 MB); this is the server's hard cap. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export const uploadPhotoSchema = z.object({
  productId: z.uuid(),
  photo: z
    .file("Choose a photo")
    .min(1, "That photo is empty")
    .max(MAX_PHOTO_BYTES, "That photo is too large (4 MB at most)"),
});

export const photoIdSchema = z.object({ id: z.uuid() });

export const PRODUCT_STATUSES = ["active", "archived", "all"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type ProductFilters = {
  categoryId?: string;
  typeId?: string;
  colourId?: string;
  status: ProductStatus;
};

const oneParam = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const idParam = (value: unknown) => {
  const v = oneParam(value);
  return v && z.uuid().safeParse(v).success ? v : undefined;
};

/**
 * Filters from the products page URL (?category=…&type=…&colour=…&status=…). Anything
 * unrecognised is ignored, so an old or hand-edited link still shows something.
 */
export function parseProductFilters(
  params: Record<string, string | string[] | undefined>,
): ProductFilters {
  const status = oneParam(params.status);
  return {
    categoryId: idParam(params.category),
    typeId: idParam(params.type),
    colourId: idParam(params.colour),
    status: PRODUCT_STATUSES.find((s) => s === status) ?? "active",
  };
}

/** The products page URL for these filters (defaults left out, so links stay short). */
export function productsUrl(filters: ProductFilters): string {
  const params = new URLSearchParams();
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.typeId) params.set("type", filters.typeId);
  if (filters.colourId) params.set("colour", filters.colourId);
  if (filters.status !== "active") params.set("status", filters.status);
  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

export const productIdSchema = z.object({ id: z.uuid() });
