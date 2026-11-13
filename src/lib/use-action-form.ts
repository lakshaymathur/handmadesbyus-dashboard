"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ClientResult } from "@/lib/client-action";

export type FormMessageState = { ok: boolean; text: string } | null;

type Options = {
  /** Message shown after a successful save. */
  success?: string;
  /** Clear the form after a successful save (e.g. an "Add" form). */
  resetOnSuccess?: boolean;
  /** Runs after a successful save (e.g. close an inline editor). */
  onSuccess?: () => void;
};

/**
 * State for a form that submits to a server action: values, per-field errors (cleared as
 * a field is edited), a success/failure message and a pending flag. A whole-form error
 * is only shown when no field shows one. A redirecting action (no result) shows nothing.
 */
export function useActionForm<Values extends Record<string, unknown>>(
  initial: Values,
  run: (values: Values) => Promise<ClientResult>,
  options: Options = {},
) {
  const [values, setValues] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<FormMessageState>(null);
  const [pending, startTransition] = useTransition();

  /** Sets a field; `errorKey` names its key in the schema if that differs (default: key). */
  function set<K extends keyof Values & string>(
    key: K,
    value: Values[K],
    errorKey: string = key,
  ) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors(({ [errorKey]: _cleared, ...rest }) => rest);
    setMessage(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await run(values);
      if (!result) return;
      if (result.ok) {
        setFieldErrors({});
        if (options.resetOnSuccess) setValues(initial);
        if (options.success) setMessage({ ok: true, text: options.success });
        options.onSuccess?.();
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      const shownOnFields = Object.keys(result.fieldErrors ?? {}).length > 0;
      if (!shownOnFields) setMessage({ ok: false, text: result.error });
    });
  }

  const error = (key: string) => fieldErrors[key]?.[0];

  return { values, set, error, message, pending, submit };
}
