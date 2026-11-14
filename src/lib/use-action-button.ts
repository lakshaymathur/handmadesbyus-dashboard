"use client";

import { useState, useTransition } from "react";
import type { z } from "zod";
import type { ActionResult } from "@/lib/auth/action";
import { validateThenRun } from "@/lib/client-action";
import type { FormMessageState } from "@/lib/use-action-form";

/**
 * State for buttons that run a server action without a form (Archive, Delete, Make
 * default…): a pending flag, and the action's error as a message. A result-less
 * (redirecting) action shows nothing.
 *
 *   const { run, pending, message } = useActionButton(photoIdSchema);
 *   <Button onClick={() => run(deleteProductPhoto, { id })} disabled={pending}>
 *   <FormMessage message={message} />
 */
export function useActionButton<Schema extends z.ZodType>(schema: Schema) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<FormMessageState>(null);

  function run<T>(
    action: (input: z.input<Schema>) => Promise<ActionResult<T>>,
    input: z.input<Schema>,
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await validateThenRun(schema, input, action);
      if (result && !result.ok) setMessage({ ok: false, text: result.error });
    });
  }

  return { run, pending, message };
}
