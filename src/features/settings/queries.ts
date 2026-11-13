import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { byName } from "@/db/order";
import {
  categories,
  customisationChoices,
  customisationOptionCategories,
  customisationOptions,
  deliveryPartners,
  listItems,
  productionStages,
} from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/lib/auth/session";
import {
  DEFAULT_DUE_SOON_DAYS,
  INPUT_TYPE_LABELS,
  type InputType,
  type ListKind,
} from "./schema";

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
    .orderBy(asc(listItems.sortOrder), byName(listItems.name));
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
    .orderBy(asc(deliveryPartners.sortOrder), byName(deliveryPartners.name));
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
    .orderBy(asc(categories.sortOrder), byName(categories.name));
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
    .orderBy(asc(productionStages.position), byName(productionStages.name));
  return {
    ...category,
    stages: stages.map((stage, index) => ({
      ...stage,
      active: true,
      detail: stageRole(index, stages.length),
    })),
  };
}

/** Option → names of the categories it applies to, in category order. */
async function optionCategoryNames(): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      optionId: customisationOptionCategories.optionId,
      name: categories.name,
    })
    .from(customisationOptionCategories)
    .innerJoin(
      categories,
      eq(categories.id, customisationOptionCategories.categoryId),
    )
    .orderBy(asc(categories.sortOrder), byName(categories.name));
  const byOption = new Map<string, string[]>();
  for (const { optionId, name } of rows) {
    byOption.set(optionId, [...(byOption.get(optionId) ?? []), name]);
  }
  return byOption;
}

/** "Choice from a list · +₹50 (cost ₹20) · Box, Pouch" */
export function describeOption(option: {
  inputType: InputType;
  maxLength: number | null;
  extraPrice: number;
  extraCost: number;
  categoryNames: string[];
}): string {
  const input =
    option.inputType === "text"
      ? `Text, up to ${option.maxLength} characters`
      : INPUT_TYPE_LABELS[option.inputType];
  // U+2060 WORD JOINER keeps "+" and "₹50" on one line when the summary wraps.
  const money = `+\u2060${formatMoney(option.extraPrice)} (cost\u00a0${formatMoney(option.extraCost)})`;
  const where =
    option.categoryNames.length > 0
      ? option.categoryNames.join(", ")
      : "No categories yet";
  return [input, money, where].join(" · ");
}

/** Customisation options in display order, each linking to its page. */
export async function getCustomisationOptions(): Promise<ManagedItem[]> {
  await requireUser();
  const [options, names] = await Promise.all([
    db
      .select()
      .from(customisationOptions)
      .orderBy(
        asc(customisationOptions.sortOrder),
        byName(customisationOptions.name),
      ),
    optionCategoryNames(),
  ]);
  return options.map((option) => ({
    id: option.id,
    name: option.name,
    active: option.active,
    detail: describeOption({
      ...option,
      categoryNames: names.get(option.id) ?? [],
    }),
    href: `/settings/customisations/${option.id}`,
  }));
}

export type CategoryChoice = { id: string; name: string; active: boolean };

/** Categories an option can apply to (inactive ones included, for options that use them). */
export async function getCategoryChoices(): Promise<CategoryChoice[]> {
  await requireUser();
  return db
    .select({
      id: categories.id,
      name: categories.name,
      active: categories.active,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), byName(categories.name));
}

export type CustomisationOptionDetail = {
  id: string;
  name: string;
  active: boolean;
  inputType: InputType;
  maxLength: number | null;
  extraPrice: number;
  extraCost: number;
  categoryIds: string[];
  choices: ManagedItem[];
};

/** One option with its categories and choices, or null if there's no such option. */
export async function getCustomisationOption(
  id: string,
): Promise<CustomisationOptionDetail | null> {
  await requireUser();
  const option = await db.query.customisationOptions.findFirst({
    where: eq(customisationOptions.id, id),
  });
  if (!option) return null;
  const [links, choices] = await Promise.all([
    db
      .select({ categoryId: customisationOptionCategories.categoryId })
      .from(customisationOptionCategories)
      .where(eq(customisationOptionCategories.optionId, id)),
    db
      .select({
        id: customisationChoices.id,
        name: customisationChoices.name,
        active: customisationChoices.active,
      })
      .from(customisationChoices)
      .where(eq(customisationChoices.optionId, id))
      .orderBy(
        asc(customisationChoices.sortOrder),
        byName(customisationChoices.name),
      ),
  ]);
  return {
    id: option.id,
    name: option.name,
    active: option.active,
    inputType: option.inputType,
    maxLength: option.maxLength,
    extraPrice: option.extraPrice,
    extraCost: option.extraCost,
    categoryIds: links.map((l) => l.categoryId),
    choices: choices.map((c) => ({ ...c, detail: null })),
  };
}

export type GeneralSettings = { dueSoonDays: number };

/** App-wide settings, with defaults until someone saves them. */
export async function getGeneralSettings(): Promise<GeneralSettings> {
  await requireUser();
  const row = await db.query.appSettings.findFirst({
    columns: { dueSoonDays: true },
  });
  return { dueSoonDays: row?.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS };
}
