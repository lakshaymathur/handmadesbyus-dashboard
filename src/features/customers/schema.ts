import { z } from "zod";
import type { customerSource } from "@/db/schema";
import { INDIAN_STATES } from "@/lib/indian-states";
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

/**
 * Reduces "@Ananya.Creates", "ananya.creates" or a profile link
 * ("https://www.instagram.com/ananya.creates/?hl=en") to the stored form: lower case,
 * no "@". Instagram handles are case-insensitive.
 */
export function normalizeInstagramHandle(text: string): string {
  const trimmed = text.trim();
  const link = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)/i.exec(
    trimmed,
  );
  return (link?.[1] ?? trimmed).replace(/^@/, "").toLowerCase();
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
  .transform(normalizeInstagramHandle)
  .transform((s) => (s === "" ? null : s))
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
] as const satisfies readonly (typeof customerSource.enumValues)[number][];

export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

export const SOURCE_LABELS: Record<CustomerSource, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  referral: "Referral",
  exhibition: "Exhibition",
  website: "Website",
  other: "Other",
};

/** The customer's own fields (no address). */
const customerShape = {
  mobile: mobileSchema,
  instagramHandle: instagramHandleSchema,
  firstName: nameSchema,
  lastName: optionalText(60, "Keep it under 60 characters"),
  source: z.enum(CUSTOMER_SOURCES, "Choose where they came from"),
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

/** For the live "already exists" check while typing. */
export const duplicateCheckSchema = z.object({
  mobile: z.string().max(40),
  instagramHandle: z.string().max(200),
});
