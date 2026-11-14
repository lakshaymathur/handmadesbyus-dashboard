import { asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { byName } from "@/db/order";
import {
  categories,
  customisationOptionCategories,
  customisationOptions,
  listItems,
  productCustomisationOptions,
  products,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

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
};

/** Every product: active first, then by name. */
export async function getProducts(): Promise<ProductSummary[]> {
  await requireUser();
  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      category: categories.name,
      colour: colours.name,
      price: products.price,
      archived: sql<boolean>`${products.archivedAt} IS NOT NULL`,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(colours, eq(colours.id, products.colourId))
    .orderBy(sql`${products.archivedAt} IS NOT NULL`, byName(products.name));
}

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
  options: { id: string; name: string }[];
};

/** One product with its list names and customisation options, or null. */
export async function getProduct(id: string): Promise<ProductDetail | null> {
  await requireUser();
  const [[product], options] = await Promise.all([
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
  ]);
  return product ? { ...product, options } : null;
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
  const [categoryRows, itemRows, optionRows, links] = await Promise.all([
    db.query.categories.findMany({
      columns: choice,
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
    db.query.customisationOptions.findMany({
      columns: choice,
      orderBy: [
        asc(customisationOptions.sortOrder),
        byName(customisationOptions.name),
      ],
    }),
    db.select().from(customisationOptionCategories),
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
    options: optionRows.map((o) => ({
      ...o,
      categoryIds: links
        .filter((l) => l.optionId === o.id)
        .map((l) => l.categoryId),
    })),
  };
}
