import type { z } from "zod";
import type { ActionResult } from "@/lib/auth/action";
import { toFormErrors } from "@/lib/validation";

/**
 * Validates `input` with the form's Zod schema in the browser (instant field errors, no
 * round trip), then calls the server action, which validates again with the same schema.
 */
export async function validateThenRun<Schema extends z.ZodType, T>(
  schema: Schema,
  input: z.input<Schema>,
  action: (input: z.input<Schema>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const { formErrors, fieldErrors } = toFormErrors(parsed.error);
    return {
      ok: false,
      error: formErrors[0] ?? "Please check the highlighted fields.",
      fieldErrors,
    };
  }
  return action(input);
}
