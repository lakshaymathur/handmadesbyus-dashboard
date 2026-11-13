"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/lib/auth/action";

type Message = { ok: boolean; text: string };

/**
 * State for a form that submits to a server action: values, per-field errors (cleared as
 * a field is edited), a success/failure message and a pending flag.
 */
export function useActionForm<Values extends Record<string, string>>(
  initial: Values,
  run: (values: Values) => Promise<ActionResult<unknown>>,
  options: { success?: string; resetOnSuccess?: boolean } = {},
) {
  const [values, setValues] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();

  function set(key: keyof Values & string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors(({ [key]: _cleared, ...rest }) => rest);
    setMessage(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await run(values);
      // An action that redirects doesn't return a result.
      if (!result) return;
      if (result.ok) {
        setFieldErrors({});
        if (options.resetOnSuccess) setValues(initial);
        if (options.success) setMessage({ ok: true, text: options.success });
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      const shownOnFields = Object.keys(result.fieldErrors ?? {}).length > 0;
      if (!shownOnFields) setMessage({ ok: false, text: result.error });
    });
  }

  const error = (key: keyof Values & string) => fieldErrors[key]?.[0];

  return { values, set, error, message, pending, submit };
}
