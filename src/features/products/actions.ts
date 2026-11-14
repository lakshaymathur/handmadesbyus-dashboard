"use server";

import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { db } from "@/db/client";
import type { Executor } from "@/db/connect";
import { uniqueViolation } from "@/db/errors";
import {
  categories,
  customisationOptionCategories,
  listItems,
  productCustomisationOptions,
  products,
} from "@/db/schema";
import { ActionError, assertFound, authedAction } from "@/lib/auth/action";
import {
  productSchema,
  setArchivedSchema,
  updateProductSchema,
} from "./schema";

// Products (§2.2, §3.4). The SKU is unique ignoring case; type/colour/design must come
// from their own managed lists, and customisation options from the product's category.

const GONE = "That product no longer exists. Reload the page.";

type ProductValues = z.output<typeof productSchema>;

/** A product with this SKU (any case) other than `excludeId`, as a field error. */
async function skuError(tx: Executor, sku: string, excludeId?: string) {
  const [row] = await tx
    .select({ name: products.name })
    .from(products)
    .where(
      and(
        sql`lower(${products.sku}) = lower(${sku})`,
        excludeId ? ne(products.id, excludeId) : undefined,
      ),
    );
  return row
    ? new ActionError("That product ID is taken.", {
        sku: [`Already used by “${row.name}”`],
      })
    : null;
}

/**
 * Checks the chosen category, list entries and options exist and fit together (the
 * database only knows they're list items and options).
 */
async function checkChoices(tx: Executor, input: ProductValues) {
  const [category] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId));
  if (!category) {
    throw new ActionError("That category no longer exists. Reload the page.");
  }

  const picks = [
    ["typeId", "product_type"],
    ["colourId", "colour"],
    ["designId", "design"],
  ] as const;
  const ids = picks.map(([key]) => input[key]).filter((id) => id !== null);
  const items =
    ids.length === 0
      ? []
      : await tx
          .select({ id: listItems.id, kind: listItems.kind })
          .from(listItems)
          .where(inArray(listItems.id, ids));
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, kind] of picks) {
    const id = input[key];
    if (id !== null && !items.some((i) => i.id === id && i.kind === kind)) {
      fieldErrors[key] = ["That entry no longer exists. Reload the page."];
    }
  }

  if (input.optionIds.length > 0) {
    const allowed = await tx
      .select({ optionId: customisationOptionCategories.optionId })
      .from(customisationOptionCategories)
      .where(
        and(
          eq(customisationOptionCategories.categoryId, input.categoryId),
          inArray(customisationOptionCategories.optionId, input.optionIds),
        ),
      );
    if (allowed.length !== new Set(input.optionIds).size) {
      fieldErrors.optionIds = [
        "Some options don't apply to this category. Reload the page.",
      ];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ActionError("Please check the highlighted fields.", fieldErrors);
  }
}

function columns(input: ProductValues) {
  return {
    sku: input.sku,
    name: input.name,
    categoryId: input.categoryId,
    typeId: input.typeId,
    colourId: input.colourId,
    designId: input.designId,
    lengthMm: input.length,
    widthMm: input.width,
    heightMm: input.height,
    weightG: input.weight,
    price: input.price,
    cost: input.cost,
  };
}

/** Runs a save; a SKU clash between our check and the write is reported like the check. */
async function saving<T>(
  input: ProductValues,
  excludeId: string | undefined,
  save: (tx: Executor) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const taken = await skuError(tx, input.sku, excludeId);
      if (taken) throw taken;
      await checkChoices(tx, input);
      return save(tx);
    });
  } catch (error) {
    if (uniqueViolation(error) === "products_sku_unique") {
      throw (
        (await skuError(db, input.sku, excludeId)) ??
        new ActionError("That product ID is taken.")
      );
    }
    throw error;
  }
}

/** Adds a product, then opens its page. */
export const createProduct = authedAction(
  productSchema,
  async (input, { audit }) => {
    const id = await saving(input, undefined, async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({ ...columns(input), ...audit.create })
        .returning({ id: products.id });
      if (!row) throw new Error("Product insert returned no row");
      if (input.optionIds.length > 0) {
        await tx.insert(productCustomisationOptions).values(
          [...new Set(input.optionIds)].map((optionId) => ({
            productId: row.id,
            optionId,
            ...audit.create,
          })),
        );
      }
      return row.id;
    });
    redirect(`/products/${id}`);
  },
);

/**
 * Saves a product, then goes back to its page. Orders keep the price and cost they were
 * placed with (CLAUDE.md: snapshots).
 */
export const updateProduct = authedAction(
  updateProductSchema,
  async ({ id, ...input }, { audit }) => {
    await saving(input, id, async (tx) => {
      const rows = await tx
        .update(products)
        .set({ ...columns(input), ...audit.update })
        .where(eq(products.id, id))
        .returning({ id: products.id });
      assertFound(rows, GONE);
      const optionIds = [...new Set(input.optionIds)];
      // Remove options no longer offered; keep (and keep the audit of) the rest.
      await tx
        .delete(productCustomisationOptions)
        .where(
          and(
            eq(productCustomisationOptions.productId, id),
            optionIds.length > 0
              ? notInArray(productCustomisationOptions.optionId, optionIds)
              : undefined,
          ),
        );
      if (optionIds.length > 0) {
        await tx
          .insert(productCustomisationOptions)
          .values(
            optionIds.map((optionId) => ({
              productId: id,
              optionId,
              ...audit.create,
            })),
          )
          .onConflictDoNothing();
      }
    });
    redirect(`/products/${id}`);
  },
);

/** Archives a product (hidden from new orders, kept for old ones) or brings it back. */
export const setProductArchived = authedAction(
  setArchivedSchema,
  async ({ id, archived }, { audit }) => {
    const rows = await db
      .update(products)
      .set({
        // Archiving twice keeps the first date.
        archivedAt: archived
          ? sql`coalesce(${products.archivedAt}, now())`
          : null,
        ...audit.update,
      })
      .where(eq(products.id, id))
      .returning({ id: products.id });
    assertFound(rows, GONE);
    refresh();
  },
);
