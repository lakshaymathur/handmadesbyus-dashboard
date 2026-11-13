import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireUser, type CurrentUser } from "./session";

/** What every server action returns. `fieldErrors` keys match the form's Zod schema. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** An error whose message is safe to show the user (e.g. "Mobile number already exists"). */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export type ActionContext = {
  user: CurrentUser;
  /** Spread into inserts (`...audit.create`) and updates (`...audit.update`). */
  audit: {
    create: { createdBy: string; updatedBy: string };
    update: { updatedBy: string };
  };
};

/**
 * Wraps every server action (enforced by the `local/authed-action` lint rule):
 * 1. requires a signed-in user (redirects to /login otherwise),
 * 2. validates input with the form's Zod schema (the same one the client uses),
 * 3. passes the user and audit fields to the handler,
 * 4. turns errors into an ActionResult: ActionError messages are shown, anything else
 *    is logged and replaced with a generic message.
 *
 * export const createCustomer = authedAction(customerSchema, async (input, { audit }) => {
 *   return db.insert(customers).values({ ...input, ...audit.create }).returning();
 * });
 */
export function authedAction<Schema extends z.ZodType, Data>(
  schema: Schema,
  handler: (input: z.output<Schema>, ctx: ActionContext) => Promise<Data>,
): (input: z.input<Schema>) => Promise<ActionResult<Data>> {
  return async (input) => {
    // Auth first, so signed-out callers learn nothing about validation rules.
    const user = await requireUser();

    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
          string,
          string[]
        >,
      };
    }

    const ctx: ActionContext = {
      user,
      audit: {
        create: { createdBy: user.id, updatedBy: user.id },
        update: { updatedBy: user.id },
      },
    };

    try {
      return { ok: true, data: await handler(parsed.data, ctx) };
    } catch (error) {
      unstable_rethrow(error); // let redirect() / notFound() through
      if (error instanceof ActionError) {
        return {
          ok: false,
          error: error.message,
          fieldErrors: error.fieldErrors,
        };
      }
      console.error("Server action failed:", error);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
