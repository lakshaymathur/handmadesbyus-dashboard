import { z } from "zod";
import type { customerSource } from "@/db/schema";
import { INDIAN_STATES } from "@/lib/indian-states";
import type { Same } from "@/lib/types";
import { nameSchema } from "@/lib/validation";

// Zod schemas for the customer forms (§2.1), shared by the client forms and the actions.

/**
 * Reduces what people type or paste to the 10-digit number the database stores:
 * "+91 98100 00001", "098100-00001" and "9810000001" all become "9810000001".
 * Anything else comes back as its digits, for the validator to reject.
 */
export function normalizeMobile(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** First path parts of instagram.com links that aren't profiles (posts, reels, …). */
const NOT_PROFILE_PATHS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "explore",
  "accounts",
  "direct",
  "about",
  "legal",
]);

/**
 * Reduces "@Ananya.Creates", "ananya.creates" or a profile link
 * ("https://www.instagram.com/ananya.creates/?hl=en") to the stored form: lower case,
 * no "@". Instagram handles are case-insensitive. A story link gives the poster's
 * handle. Returns null for a link that isn't to a profile (a post or reel): it doesn't
 * say whose it is.
 */
export function normalizeInstagramHandle(text: string): string | null {
  const trimmed = text.trim();
  const link =
    /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^?#\s]*)/i.exec(trimmed);
  if (!link) return trimmed.replace(/^@/, "").toLowerCase();
  const [first = "", second = ""] = (link[1] ?? "").toLowerCase().split("/");
  if (first === "stories") return second || null;
  if (first === "" || NOT_PROFILE_PATHS.has(first)) return null;
  return first;
}

/**
 * The digits to look for when a search looks like (part of) a mobile number: a leading
 * +91, 91 followed by a space or dash, or 0 is a prefix, not part of the number.
 * "+91 98100" → "98100".
 */
export function mobileSearchDigits(query: string): string {
  const q = query.trim();
  const digits = q.replace(/\D/g, "");
  if (/^(\+91|91[\s-])/.test(q)) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (q.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Trimmed text, or null when left empty. */
function optionalText(max: number, message: string) {
  return z
    .string()
    .transform((s) => s.trim())
    .transform((s) => (s === "" ? null : s))
    .pipe(z.string().max(max, message).nullable());
}

export const mobileSchema = z
  .string()
  .transform(normalizeMobile)
  .pipe(z.string().regex(/^[0-9]{10}$/, "Enter a 10-digit mobile number"));

const optionalMobile = z
  .string()
  .transform(normalizeMobile)
  .transform((s) => (s === "" ? null : s))
  .pipe(
    z
      .string()
      .regex(/^[0-9]{10}$/, "Enter a 10-digit mobile number")
      .nullable(),
  );

export const instagramHandleSchema = z
  .string()
  .transform((text, ctx) => {
    const handle = normalizeInstagramHandle(text);
    if (handle === null) {
      ctx.addIssue({
        code: "custom",
        message: "That's a link to a post. Paste their profile link or handle",
      });
      return z.NEVER;
    }
    return handle === "" ? null : handle;
  })
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9._]{1,30}$/,
        "Up to 30 letters, numbers, dots and underscores",
      )
      .nullable(),
  );

const optionalEmail = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === "" ? null : s))
  .pipe(z.email("Enter an email like name@example.com").max(200).nullable());

export const CUSTOMER_SOURCES = [
  "instagram",
  "whatsapp",
  "referral",
  "exhibition",
  "website",
  "other",
] as const;

export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

// Fails to compile if this list and the customer_source enum drift apart.
const sourcesMatch: Same<
  CustomerSource,
  (typeof customerSource.enumValues)[number]
> = true;
void sourcesMatch;

/**
 * The source select: required when adding. "" (the "Not recorded" placeholder) only
 * appears when editing a customer saved without one, and saving keeps it unset.
 */
const sourceInput = z.enum(
  [...CUSTOMER_SOURCES, ""],
  "Choose where they came from",
);
const requiredSource = sourceInput.pipe(
  z.enum(CUSTOMER_SOURCES, "Choose where they came from"),
);
const optionalSource = sourceInput.transform((v) => (v === "" ? null : v));

export const SOURCE_LABELS: Record<CustomerSource, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  referral: "Referral",
  exhibition: "Exhibition",
  website: "Website",
  other: "Other",
};

/** The customer's own fields (no address). */
export const customerShape = {
  mobile: mobileSchema,
  instagramHandle: instagramHandleSchema,
  firstName: nameSchema,
  lastName: optionalText(60, "Keep it under 60 characters"),
  source: requiredSource,
  altMobile: optionalMobile,
  email: optionalEmail,
  notes: optionalText(2000, "Keep notes under 2,000 characters"),
};

/** One address (§2.1). Country is always India for now: PINs are Indian. */
export const addressShape = {
  line1: z
    .string()
    .trim()
    .min(1, "Enter the house or flat number")
    .max(200, "Keep it under 200 characters"),
  line2: optionalText(200, "Keep it under 200 characters"),
  landmark: optionalText(200, "Keep it under 200 characters"),
  city: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, "Enter the city")
        .max(60, "Keep it under 60 characters"),
    ),
  state: z.enum(INDIAN_STATES, "Choose a state"),
  pin: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code")),
};

export const addressSchema = z.object(addressShape);

/** A new customer with their first (default) address, as one form. */
export const createCustomerSchema = z.object({
  ...customerShape,
  ...addressShape,
});

export type CreateCustomerInput = z.input<typeof createCustomerSchema>;

/** Editing a customer's own details (addresses are edited one at a time). */
export const updateCustomerSchema = z.object({
  id: z.uuid(),
  ...customerShape,
  source: optionalSource,
});

export type CustomerInput = z.input<z.ZodObject<typeof customerShape>>;

/** For the live "already exists" check while typing; `excludeId` is the customer being edited. */
export const duplicateCheckSchema = z.object({
  mobile: z.string().max(40),
  instagramHandle: z.string().max(200),
  excludeId: z.uuid().optional(),
});

export type AddressInput = z.input<typeof addressSchema>;

export const addAddressSchema = z.object({
  customerId: z.uuid(),
  ...addressShape,
  makeDefault: z.boolean(),
});

export const updateAddressSchema = z.object({
  id: z.uuid(),
  ...addressShape,
});

export const addressIdSchema = z.object({ id: z.uuid() });

/** Finding customers from another form (the order form's customer picker). */
export const customerSearchSchema = z.object({ query: z.string().max(100) });

export const customerIdSchema = z.object({ id: z.uuid() });
