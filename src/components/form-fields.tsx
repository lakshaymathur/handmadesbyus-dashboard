"use client";

import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Form controls for forms built on useActionForm (customers, products, …).

export const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

/** What a fieldset needs from useActionForm, for string fields. */
export type Bind<Values> = {
  idPrefix: string;
  values: Values;
  set: (key: keyof Values & string, value: string) => void;
  error: (key: string) => string | undefined;
};

export function TextField<Values>({
  bind,
  name,
  label,
  help,
  inputMode,
  type,
  autoComplete = "off",
  autoCapitalize,
  onBlur,
  note,
}: {
  bind: Bind<Values>;
  name: keyof Values & string;
  label: string;
  help?: string;
  inputMode?: "tel" | "numeric" | "decimal" | "email";
  type?: "tel" | "email";
  autoComplete?: string;
  autoCapitalize?: "none" | "words";
  onBlur?: () => void;
  /** Shown under the field instead of `help` when there's no error (e.g. a warning). */
  note?: React.ReactNode;
}) {
  const id = `${bind.idPrefix}-${name}`;
  const error = bind.error(name);
  return (
    <FormField
      id={id}
      label={label}
      error={error}
      help={note ? undefined : help}
    >
      <Input
        id={id}
        value={String(bind.values[name] ?? "")}
        onChange={(e) => bind.set(name, e.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        type={type}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        spellCheck={autoCapitalize === "none" ? false : undefined}
        className="h-11"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
      />
      {note && !error && (
        <div id={`${id}-note`} role="status" className="text-sm">
          {note}
        </div>
      )}
    </FormField>
  );
}

export function TextArea<Values>({
  bind,
  name,
  label,
  help,
}: {
  bind: Bind<Values>;
  name: keyof Values & string;
  label: string;
  help?: string;
}) {
  const id = `${bind.idPrefix}-${name}`;
  const error = bind.error(name);
  return (
    <FormField id={id} label={label} error={error} help={help}>
      <textarea
        id={id}
        value={String(bind.values[name] ?? "")}
        onChange={(e) => bind.set(name, e.target.value)}
        rows={3}
        className={cn(selectClass, "h-auto py-2")}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
      />
    </FormField>
  );
}

export function SelectField<Values>({
  bind,
  name,
  label,
  options,
  placeholder,
  autoComplete,
}: {
  bind: Bind<Values>;
  name: keyof Values & string;
  label: string;
  options: readonly { value: string; label: string }[];
  /** A disabled first option shown until something is chosen. */
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = `${bind.idPrefix}-${name}`;
  const error = bind.error(name);
  return (
    <FormField id={id} label={label} error={error}>
      <select
        id={id}
        value={String(bind.values[name] ?? "")}
        onChange={(e) => bind.set(name, e.target.value)}
        autoComplete={autoComplete}
        className={selectClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
