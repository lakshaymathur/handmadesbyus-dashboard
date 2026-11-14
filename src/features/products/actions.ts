"use server";

import { and, asc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { db } from "@/db/client";
import type { Executor } from "@/db/connect";
import { foreignKeyViolation, uniqueViolation } from "@/db/errors";
import {
  categories,
  customisationOptionCategories,
  listItems,
  productCustomisationOptions,
  productPhotos,
  products,
} from "@/db/schema";
import { ActionError, assertFound, authedAction } from "@/lib/auth/action";
import { IMAGE_EXTENSIONS, sniffImageType } from "@/lib/image-type";
import { getStorage, newKey } from "@/lib/storage";
import {
  MAX_PHOTOS,
  photoIdSchema,
  productIdSchema,
  productSchema,
  setArchivedSchema,
  updateProductSchema,
  uploadPhotoSchema,
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
 * database only knows they're list items and options). `kept` are options the product
 * already offers in this category: they may stay even if Settings has since stopped
 * offering them for the category (otherwise the product could never be saved again).
 */
async function checkChoices(
  tx: Executor,
  input: ProductValues,
  kept: string[] = [],
) {
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

  const added = [...new Set(input.optionIds)].filter(
    (id) => !kept.includes(id),
  );
  if (added.length > 0) {
    const allowed = await tx
      .select({ optionId: customisationOptionCategories.optionId })
      .from(customisationOptionCategories)
      .where(
        and(
          eq(customisationOptionCategories.categoryId, input.categoryId),
          inArray(customisationOptionCategories.optionId, added),
        ),
      );
    if (allowed.length !== added.length) {
      fieldErrors.optionIds = [
        "Some options don't apply to this category. Reload the page.",
      ];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ActionError("Please check the highlighted fields.", fieldErrors);
  }
}

/** The options a product offers now, if it stays in `categoryId` (else none are kept). */
async function keptOptions(
  tx: Executor,
  productId: string,
  categoryId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ optionId: productCustomisationOptions.optionId })
    .from(productCustomisationOptions)
    .innerJoin(products, eq(products.id, productCustomisationOptions.productId))
    .where(
      and(
        eq(productCustomisationOptions.productId, productId),
        eq(products.categoryId, categoryId),
      ),
    );
  return rows.map((r) => r.optionId);
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
      await checkChoices(
        tx,
        input,
        excludeId ? await keptOptions(tx, excludeId, input.categoryId) : [],
      );
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

// --- Photos (§2.2: up to 5, the first is the thumbnail) ----------------------------

const PHOTO_GONE = "That photo no longer exists. Reload the page.";

/** Locks the product so photo changes for it happen one at a time. */
async function lockProduct(tx: Executor, productId: string): Promise<void> {
  const rows = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .for("no key update");
  assertFound(rows, GONE);
}

/** The photo's product, locked; the photo is re-read under the lock. */
async function lockPhoto(tx: Executor, photoId: string) {
  const [before] = await tx
    .select({ productId: productPhotos.productId })
    .from(productPhotos)
    .where(eq(productPhotos.id, photoId));
  if (!before) throw new ActionError(PHOTO_GONE);
  await lockProduct(tx, before.productId);
  const [photo] = await tx
    .select({
      productId: productPhotos.productId,
      storageKey: productPhotos.storageKey,
    })
    .from(productPhotos)
    .where(eq(productPhotos.id, photoId));
  if (!photo) throw new ActionError(PHOTO_GONE);
  return photo;
}

/** Writes positions 0, 1, 2… in the given order. */
async function renumber(
  tx: Executor,
  ids: string[],
  update: { updatedBy: string },
) {
  for (const [position, id] of ids.entries()) {
    await tx
      .update(productPhotos)
      .set({ position, ...update })
      .where(eq(productPhotos.id, id));
  }
}

async function photoIds(tx: Executor, productId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: productPhotos.id })
    .from(productPhotos)
    .where(eq(productPhotos.productId, productId))
    .orderBy(asc(productPhotos.position), asc(productPhotos.createdAt));
  return rows.map((r) => r.id);
}

/** Deletes a stored file after the database no longer points at it; failures are logged only. */
async function deleteStored(key: string) {
  try {
    await getStorage().delete(key);
  } catch (error) {
    console.error(
      "Couldn't delete a stored photo (left orphaned):",
      key,
      error,
    );
  }
}

/**
 * Adds a photo at the end. The file's real type is read from its bytes (JPEG, PNG or
 * WebP only), and that type is what it's stored and served as.
 */
export const uploadProductPhoto = authedAction(
  uploadPhotoSchema,
  async ({ productId, photo }, { audit }) => {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) {
      throw new ActionError(
        "That isn't a photo we can use. Use JPEG, PNG or WebP.",
        {
          photo: ["Use a JPEG, PNG or WebP photo"],
        },
      );
    }
    // Upload first (no lock held during the transfer); undo it if the row can't be added.
    const key = newKey(
      `products/${productId}`,
      `photo.${IMAGE_EXTENSIONS[type]}`,
    );
    await getStorage().put(key, bytes, type);
    try {
      await db.transaction(async (tx) => {
        await lockProduct(tx, productId);
        const ids = await photoIds(tx, productId);
        if (ids.length >= MAX_PHOTOS) {
          throw new ActionError(
            `A product can have ${MAX_PHOTOS} photos. Delete one first.`,
          );
        }
        await tx.insert(productPhotos).values({
          productId,
          storageKey: key,
          position: ids.length,
          ...audit.create,
        });
      });
    } catch (error) {
      await deleteStored(key);
      throw error;
    }
    refresh();
  },
);

/** Makes this the main photo (the thumbnail), keeping the others in order after it. */
export const makeMainPhoto = authedAction(
  photoIdSchema,
  async ({ id }, { audit }) => {
    await db.transaction(async (tx) => {
      const { productId } = await lockPhoto(tx, id);
      const ids = await photoIds(tx, productId);
      await renumber(tx, [id, ...ids.filter((p) => p !== id)], audit.update);
    });
    refresh();
  },
);

/** Deletes a photo (and its stored file); the rest close up, so the first stays main. */
export const deleteProductPhoto = authedAction(
  photoIdSchema,
  async ({ id }, { audit }) => {
    const key = await db.transaction(async (tx) => {
      const { productId, storageKey } = await lockPhoto(tx, id);
      await tx.delete(productPhotos).where(eq(productPhotos.id, id));
      await renumber(tx, await photoIds(tx, productId), audit.update);
      return storageKey;
    });
    await deleteStored(key);
    refresh();
  },
);

/**
 * Deletes a product that's never been on an order (§3.4), with its photos. A product on
 * an order can only be archived: the database refuses the delete (order_items → products).
 */
export const deleteProduct = authedAction(productIdSchema, async ({ id }) => {
  let keys: string[];
  try {
    keys = await db.transaction(async (tx) => {
      await lockProduct(tx, id);
      const photos = await tx
        .select({ key: productPhotos.storageKey })
        .from(productPhotos)
        .where(eq(productPhotos.productId, id));
      // Photos and offered options go with it (ON DELETE CASCADE).
      await tx.delete(products).where(eq(products.id, id));
      return photos.map((p) => p.key);
    });
  } catch (error) {
    if (foreignKeyViolation(error) !== null) {
      throw new ActionError(
        "This product is on orders, so it can't be deleted. Archive it instead.",
      );
    }
    throw error;
  }
  await Promise.all(keys.map(deleteStored));
  redirect("/products");
});
