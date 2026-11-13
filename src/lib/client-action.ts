import type { z } from "zod";
import type { ActionResult } from "@/lib/auth/action";
import { toFormErrors } from "@/lib/validation";

/**
 * What a form gets back from a server action: its result, or `undefined` when the action
 * redirected instead of returning (a create that opens the new page, or an expired
 * session sent to /login). Next.js is already navigating then; there's nothing to show.
 */
export type ClientResult<T = unknown> = ActionResult<T> | undefined;

/**
 * Validates `input` with the form's Zod schema in the browser (instant field errors, no
 * round trip), then calls the server action, which validates again with the same schema.
 */
export async function validateThenRun<Schema extends z.ZodType, T>(
  schema: Schema,
  input: z.input<Schema>,
  action: (input: z.input<Schema>) => Promise<ActionResult<T>>,
): Promise<ClientResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const { formErrors, fieldErrors } = toFormErrors(parsed.error);
    return {
      ok: false,
      error: formErrors[0] ?? "Please check the highlighted fields.",
      fieldErrors,
    };
  }
  // Typed as ActionResult, but a redirect yields no value: say so in the type.
  const result: ClientResult<T> = await action(input);
  return result;
}
