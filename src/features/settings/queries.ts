import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  categories,
  deliveryPartners,
  listItems,
  productionStages,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { ListKind } from "./schema";

export type ManagedItem = {
  id: string;
  name: string;
  active: boolean;
  detail: string | null;
  /** Page for this entry (e.g. a category's stages). */
  href?: string;
};

/** One managed list (types, colours, …) in display order, inactive entries included. */
export async function getListItems(kind: ListKind): Promise<ManagedItem[]> {
  await requireUser();
  const rows = await db
    .select({
      id: listItems.id,
      name: listItems.name,
      active: listItems.active,
    })
    .from(listItems)
    .where(eq(listItems.kind, kind))
    .orderBy(asc(listItems.sortOrder), asc(listItems.name));
  return rows.map((row) => ({ ...row, detail: null }));
}

/** Delivery partners in display order; `detail` is the tracking URL template. */
export async function getDeliveryPartners(): Promise<ManagedItem[]> {
  await requireUser();
  return db
    .select({
      id: deliveryPartners.id,
      name: deliveryPartners.name,
      active: deliveryPartners.active,
      detail: deliveryPartners.trackingUrlTemplate,
    })
    .from(deliveryPartners)
    .orderBy(asc(deliveryPartners.sortOrder), asc(deliveryPartners.name));
}

/** Categories in display order, each linking to its stages page. */
export async function getCategories(): Promise<ManagedItem[]> {
  await requireUser();
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      active: categories.active,
      stages: count(productionStages.id),
    })
    .from(categories)
    .leftJoin(productionStages, eq(productionStages.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map(({ stages, ...row }) => ({
    ...row,
    detail: stages === 1 ? "1 stage" : `${stages} stages`,
    href: `/settings/categories/${row.id}`,
  }));
}

function stageRole(index: number, total: number): string | null {
  if (total === 1) return "Only stage: items start and finish here";
  if (index === 0) return "Where new items start";
  if (index === total - 1) return "Last stage: the item is finished";
  return null;
}

export type CategoryWithStages = {
  id: string;
  name: string;
  active: boolean;
  stages: ManagedItem[];
};

/** A category and its production stages in order, or null if there's no such category. */
export async function getCategoryWithStages(
  id: string,
): Promise<CategoryWithStages | null> {
  await requireUser();
  const category = await db.query.categories.findFirst({
    columns: { id: true, name: true, active: true },
    where: eq(categories.id, id),
  });
  if (!category) return null;
  const stages = await db
    .select({ id: productionStages.id, name: productionStages.name })
    .from(productionStages)
    .where(eq(productionStages.categoryId, id))
    .orderBy(asc(productionStages.position), asc(productionStages.name));
  return {
    ...category,
    stages: stages.map((stage, index) => ({
      ...stage,
      active: true,
      detail: stageRole(index, stages.length),
    })),
  };
}
