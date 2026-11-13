import { z } from "zod";
import type { listKind } from "@/db/schema";

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

/** A list entry's name: trimmed, inner runs of spaces collapsed ("Dark  Red" → "Dark Red"). */
export const nameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z.string().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
  );

export const addListItemSchema = z.object({
  kind: z.enum(LIST_KINDS),
  name: nameSchema,
});

export const renameListItemSchema = z.object({ id, name: nameSchema });

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
