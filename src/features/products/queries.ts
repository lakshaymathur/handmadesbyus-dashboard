import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { byName } from "@/db/order";
import {
  categories,
  customisationOptionCategories,
  customisationOptions,
  listItems,
  orderItems,
  productCustomisationOptions,
  productPhotos,
  products,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { ProductFilters } from "./schema";
import { IMAGE_EXTENSIONS, type ImageType } from "@/lib/image-type";

/**
 * Where the app serves a photo (src/app/api/photos/[id]/route.ts): only signed-in users
 * can load it, and the storage service needn't be reachable from browsers.
 */
const photoUrl = (photoId: string) => `/api/photos/${photoId}`;

const types = alias(listItems, "types");
const colours = alias(listItems, "colours");
const designs = alias(listItems, "designs");

export type ProductSummary = {
  id: string;
  sku: string;
  name: string;
  category: string;
  colour: string | null;
  price: number;
  archived: boolean;
  /** URL of the main photo, if there is one. */
  thumbnailUrl: string | null;
};

/** Products matching `filters`, with their main photo: active first, then by name. */
export async function getProducts(
  // Active only unless asked: archived products are hidden from new orders.
  filters: ProductFilters = { status: "active" },
): Promise<ProductSummary[]> {
  await requireUser();
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      category: categories.name,
      colour: colours.name,
      price: products.price,
      archived: sql<boolean>`${products.archivedAt} IS NOT NULL`,
      thumbnailId: productPhotos.id,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(colours, eq(colours.id, products.colourId))
    .leftJoin(
      productPhotos,
      and(
        eq(productPhotos.productId, products.id),
        eq(productPhotos.position, 0),
      ),
    )
    .where(
      and(
        filters.categoryId
          ? eq(products.categoryId, filters.categoryId)
          : undefined,
        filters.typeId ? eq(products.typeId, filters.typeId) : undefined,
        filters.colourId ? eq(products.colourId, filters.colourId) : undefined,
        filters.status === "active"
          ? isNull(products.archivedAt)
          : filters.status === "archived"
            ? isNotNull(products.archivedAt)
            : undefined,
      ),
    )
    .orderBy(sql`${products.archivedAt} IS NOT NULL`, byName(products.name));
  return rows.map(({ thumbnailId, ...row }) => ({
    ...row,
    thumbnailUrl: thumbnailId ? photoUrl(thumbnailId) : null,
  }));
}

export type ProductPhoto = { id: string; url: string };

export type ProductDetail = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  category: string;
  typeId: string | null;
  type: string | null;
  colourId: string | null;
  colour: string | null;
  designId: string | null;
  design: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weightG: number | null;
  price: number;
  cost: number;
  archived: boolean;
  /** On at least one order: it can be archived but not deleted. */
  usedInOrders: boolean;
  options: { id: string; name: string }[];
  /** In order; the first is the main photo. */
  photos: ProductPhoto[];
};

/** One product with its list names and customisation options, or null. */
export async function getProduct(id: string): Promise<ProductDetail | null> {
  await requireUser();
  const [[product], options, photos] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        categoryId: products.categoryId,
        category: categories.name,
        typeId: products.typeId,
        type: types.name,
        colourId: products.colourId,
        colour: colours.name,
        designId: products.designId,
        design: designs.name,
        lengthMm: products.lengthMm,
        widthMm: products.widthMm,
        heightMm: products.heightMm,
        weightG: products.weightG,
        price: products.price,
        cost: products.cost,
        archived: sql<boolean>`${products.archivedAt} IS NOT NULL`,
        usedInOrders: exists(
          db
            .select({ one: sql`1` })
            .from(orderItems)
            .where(eq(orderItems.productId, products.id)),
        ).mapWith(Boolean),
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(types, eq(types.id, products.typeId))
      .leftJoin(colours, eq(colours.id, products.colourId))
      .leftJoin(designs, eq(designs.id, products.designId))
      .where(eq(products.id, id)),
    db
      .select({ id: customisationOptions.id, name: customisationOptions.name })
      .from(productCustomisationOptions)
      .innerJoin(
        customisationOptions,
        eq(customisationOptions.id, productCustomisationOptions.optionId),
      )
      .where(eq(productCustomisationOptions.productId, id))
      .orderBy(
        asc(customisationOptions.sortOrder),
        byName(customisationOptions.name),
      ),
    db
      .select({ id: productPhotos.id })
      .from(productPhotos)
      .where(eq(productPhotos.productId, id))
      .orderBy(asc(productPhotos.position), asc(productPhotos.createdAt)),
  ]);
  if (!product) return null;
  return {
    ...product,
    options,
    photos: photos.map((p) => ({ id: p.id, url: photoUrl(p.id) })),
  };
}

export type Choice = { id: string; name: string; active: boolean };

export type ProductFormChoices = {
  categories: Choice[];
  types: Choice[];
  colours: Choice[];
  designs: Choice[];
  /** Options with the categories they apply to (the form shows the chosen category's). */
  options: (Choice & { categoryIds: string[] })[];
};

/**
 * Everything the product form's dropdowns offer, inactive entries included: the form shows
 * an inactive one only if the product already uses it.
 */
export async function getProductFormChoices(): Promise<ProductFormChoices> {
  await requireUser();
  const choice = { id: true, name: true, active: true } as const;
  const [lists, optionRows, links] = await Promise.all([
    listChoices(),
    db.query.customisationOptions.findMany({
      columns: choice,
      orderBy: [
        asc(customisationOptions.sortOrder),
        byName(customisationOptions.name),
      ],
    }),
    db.select().from(customisationOptionCategories),
  ]);
  return {
    ...lists,
    options: optionRows.map((o) => ({
      ...o,
      categoryIds: links
        .filter((l) => l.optionId === o.id)
        .map((l) => l.categoryId),
    })),
  };
}

export type ProductFilterChoices = Omit<ProductFormChoices, "options">;

/** The products page's filter dropdowns: categories, types, colours (and designs). */
export async function getProductFilterChoices(): Promise<ProductFilterChoices> {
  await requireUser();
  return listChoices();
}

/** Categories and the product lists, inactive entries included, in display order. */
async function listChoices(): Promise<ProductFilterChoices> {
  const [categoryRows, itemRows] = await Promise.all([
    db.query.categories.findMany({
      columns: { id: true, name: true, active: true },
      orderBy: [asc(categories.sortOrder), byName(categories.name)],
    }),
    db
      .select({
        id: listItems.id,
        name: listItems.name,
        active: listItems.active,
        kind: listItems.kind,
      })
      .from(listItems)
      .where(inArray(listItems.kind, ["product_type", "colour", "design"]))
      .orderBy(asc(listItems.sortOrder), byName(listItems.name)),
  ]);
  const of = (kind: string) =>
    itemRows
      .filter((i) => i.kind === kind)
      .map(({ id, name, active }) => ({ id, name, active }));
  return {
    categories: categoryRows,
    types: of("product_type"),
    colours: of("colour"),
    designs: of("design"),
  };
}

/** What the photo route needs to stream a photo: its storage key and image type. */
export async function getPhotoFile(
  photoId: string,
): Promise<{ key: string; type: ImageType } | null> {
  await requireUser();
  const [row] = await db
    .select({ key: productPhotos.storageKey })
    .from(productPhotos)
    .where(eq(productPhotos.id, photoId));
  if (!row) return null;
  // Served as the type its key was given at upload (from the file's bytes), never as
  // whatever the storage service reports.
  const extension = row.key.split(".").pop();
  const type = (Object.keys(IMAGE_EXTENSIONS) as ImageType[]).find(
    (t) => IMAGE_EXTENSIONS[t] === extension,
  );
  return type ? { key: row.key, type } : null;
}
