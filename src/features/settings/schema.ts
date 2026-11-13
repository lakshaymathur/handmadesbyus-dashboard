import { z } from "zod";
import type { customisationInput, listKind } from "@/db/schema";
import { moneyField } from "@/lib/money";
import { nameSchema } from "@/lib/validation";

// Zod schemas for the Settings forms, shared by the client forms and the server actions.

/** The simple managed lists (§3.7), by URL slug. */
export const LIST_PAGES = {
  types: { kind: "product_type", title: "Product types", noun: "type" },
  colours: { kind: "colour", title: "Colours", noun: "colour" },
  designs: { kind: "design", title: "Designs", noun: "design" },
  aggregators: {
    kind: "aggregator",
    title: "Aggregators",
    noun: "aggregator",
  },
} as const;

export type ListSlug = keyof typeof LIST_PAGES;
export type ListKind = (typeof LIST_PAGES)[ListSlug]["kind"];

// Fails to compile if LIST_PAGES and the list_kind enum in src/db/schema.ts drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const kindsMatch: Same<ListKind, (typeof listKind.enumValues)[number]> = true;
void kindsMatch;

const LIST_KINDS = Object.values(LIST_PAGES).map((p) => p.kind) as [
  ListKind,
  ...ListKind[],
];

export function isListSlug(slug: string): slug is ListSlug {
  return Object.hasOwn(LIST_PAGES, slug);
}

const id = z.uuid();

export { nameSchema };

export const addListItemSchema = z.object({
  kind: z.enum(LIST_KINDS),
  name: nameSchema,
});

/** Renames anything with a name: list entries, categories, stages. */
export const renameSchema = z.object({ id, name: nameSchema });

export const idSchema = z.object({ id });

export const addCategorySchema = z.object({ name: nameSchema });

export const addStageSchema = z.object({ categoryId: id, name: nameSchema });

/** The stage every new category starts with. */
export const FIRST_STAGE_NAME = "Not started";

/**
 * A courier's tracking link with {awb} where the AWB number goes. Empty means none.
 * Same rule as the delivery_partners_tracking_url CHECK.
 */
export const trackingUrlTemplateSchema = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .pipe(
    z
      .string()
      .max(300, "Keep it under 300 characters")
      .regex(/^https?:\/\/\S+$/, "Start with https:// and leave out spaces")
      .refine((s) => s.includes("{awb}"), "Put {awb} where the AWB number goes")
      .nullable(),
  );

export const deliveryPartnerSchema = z.object({
  name: nameSchema,
  trackingUrlTemplate: trackingUrlTemplateSchema,
});

export const updateDeliveryPartnerSchema = deliveryPartnerSchema.extend({ id });

export const setActiveSchema = z.object({ id, active: z.boolean() });

export const moveSchema = z.object({ id, direction: z.enum(["up", "down"]) });

export type MoveDirection = z.infer<typeof moveSchema>["direction"];

// --- Customisation options (§2.3) ---------------------------------------------

export const INPUT_TYPES = ["none", "text", "choice"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

// Fails to compile if INPUT_TYPES and the customisation_input enum drift apart.
const inputTypesMatch: Same<
  InputType,
  (typeof customisationInput.enumValues)[number]
> = true;
void inputTypesMatch;

export const INPUT_TYPE_LABELS: Record<InputType, string> = {
  none: "No input",
  text: "Text",
  choice: "Choice from a list",
};

const MAX_EXTRA_PAISE = 1_00_000_00; // ₹1,00,000: a typo guard, well inside int4

const extraAmount = moneyField().pipe(
  z.number().max(MAX_EXTRA_PAISE, "Keep it under ₹1,00,000"),
);

/**
 * The option form's fields as typed (strings), output with paise and a numeric max length.
 * `maxLength` is required for text input and dropped for the others, matching the
 * customisation_options_max_length CHECK.
 */
const optionFields = z.object({
  name: nameSchema,
  inputType: z.enum(INPUT_TYPES),
  maxLength: z.string().trim(),
  extraPrice: extraAmount,
  extraCost: extraAmount,
  categoryIds: z.array(z.uuid()).max(100),
});

function withOptionRules<T extends z.ZodType<z.output<typeof optionFields>>>(
  schema: T,
) {
  return schema
    .superRefine((value, ctx) => {
      if (value.inputType !== "text") return;
      const n = Number(value.maxLength);
      if (!/^\d+$/.test(value.maxLength) || n < 1 || n > 500) {
        ctx.addIssue({
          code: "custom",
          path: ["maxLength"],
          message: "Enter a number from 1 to 500",
        });
      }
    })
    .transform((value) => ({
      ...value,
      maxLength: value.inputType === "text" ? Number(value.maxLength) : null,
      categoryIds: [...new Set(value.categoryIds)],
    }));
}

export const customisationOptionSchema = withOptionRules(optionFields);

export const updateCustomisationOptionSchema = withOptionRules(
  optionFields.extend({ id }),
);

export type CustomisationOptionInput = z.input<
  typeof customisationOptionSchema
>;

export const addChoiceSchema = z.object({ optionId: id, name: nameSchema });

// --- General settings ----------------------------------------------------------

/** Used until someone saves General settings (matches the app_settings default). */
export const DEFAULT_DUE_SOON_DAYS = 3;

export const generalSettingsSchema = z.object({
  dueSoonDays: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, "Enter a whole number of days from 0 to 60")
    .transform(Number)
    .pipe(z.number().max(60, "Enter a whole number of days from 0 to 60")),
});
