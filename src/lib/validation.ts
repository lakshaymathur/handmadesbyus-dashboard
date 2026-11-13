import { z } from "zod";

/**
 * A short name typed into a form (a colour, a category, a person): trimmed, inner runs of
 * spaces collapsed ("Dark  Red" → "Dark Red"), 1–60 characters.
 */
export const nameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z.string().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
  );

export type FormErrors = {
  /** Errors about the form as a whole (e.g. an object-level .refine), if any. */
  formErrors: string[];
  /** Errors per field, keyed by the full path: "name", "items.0.qty", "address.pin". */
  fieldErrors: Record<string, string[]>;
};

/** Splits a Zod error into whole-form and per-field messages, keeping nested paths. */
export function toFormErrors(error: z.ZodError): FormErrors {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
    } else {
      (fieldErrors[issue.path.map(String).join(".")] ??= []).push(
        issue.message,
      );
    }
  }
  return { formErrors, fieldErrors };
}
