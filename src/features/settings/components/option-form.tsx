"use client";

import Link from "next/link";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateThenRun } from "@/lib/client-action";
import { cn } from "@/lib/utils";
import {
  createCustomisationOption,
  updateCustomisationOption,
} from "../actions";
import type { CategoryChoice } from "../queries";
import {
  customisationOptionSchema,
  INPUT_TYPE_LABELS,
  INPUT_TYPES,
  updateCustomisationOptionSchema,
  type CustomisationOptionInput,
  type InputType,
} from "../schema";

const INPUT_TYPE_HELP: Record<InputType, string> = {
  none: "Just added or not, e.g. gift wrap.",
  text: "The customer gives some text, e.g. a name for a sticker.",
  choice: "The customer picks from a list you set up, e.g. latkan colours.",
};

type Props = {
  /** Present when editing an existing option. */
  optionId?: string;
  initial: CustomisationOptionInput;
  categories: CategoryChoice[];
};

/** Create or edit a customisation option (§2.3). */
export function OptionForm({ optionId, initial, categories }: Props) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  // Inactive categories are offered only if the option already uses them.
  const shownCategories = categories.filter(
    (c) => c.active || initial.categoryIds.includes(c.id),
  );

  function set<K extends keyof CustomisationOptionInput>(
    key: K,
    value: CustomisationOptionInput[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
    // Editing a field clears its error; the rest stay until the next submit.
    setFieldErrors(({ [key]: _cleared, ...rest }) => rest);
    setMessage(null);
  }

  function toggleCategory(categoryId: string, checked: boolean) {
    set(
      "categoryIds",
      checked
        ? [...values.categoryIds, categoryId]
        : values.categoryIds.filter((c) => c !== categoryId),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = optionId
        ? await validateThenRun(
            updateCustomisationOptionSchema,
            { ...values, id: optionId },
            updateCustomisationOption,
          )
        : await validateThenRun(
            customisationOptionSchema,
            values,
            createCustomisationOption,
          );
      // Creating redirects to the new option's page instead of returning.
      if (!result) return;
      setFieldErrors(result.ok ? {} : (result.fieldErrors ?? {}));
      setMessage(
        result.ok
          ? { ok: true, text: "Saved. New orders use these prices." }
          : { ok: false, text: result.error },
      );
    });
  }

  const error = (key: string) => fieldErrors[key]?.[0];

  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-6"
    >
      <Field id={`${id}-name`} label="Name" error={error("name")}>
        <Input
          id={`${id}-name`}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Latkan"
          autoComplete="off"
          className="h-11"
          aria-invalid={error("name") ? true : undefined}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          What does the customer give?
        </legend>
        {INPUT_TYPES.map((type) => (
          <label
            key={type}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
              values.inputType === type && "border-foreground",
            )}
          >
            <input
              type="radio"
              name="inputType"
              value={type}
              checked={values.inputType === type}
              onChange={() => set("inputType", type)}
              className="mt-1 size-4 accent-foreground"
            />
            <span className="flex flex-col">
              <span className="font-medium">{INPUT_TYPE_LABELS[type]}</span>
              <span className="text-sm text-muted-foreground">
                {INPUT_TYPE_HELP[type]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {values.inputType === "text" && (
        <Field
          id={`${id}-max`}
          label="Longest text allowed (characters)"
          error={error("maxLength")}
        >
          <Input
            id={`${id}-max`}
            value={values.maxLength}
            onChange={(e) => set("maxLength", e.target.value)}
            inputMode="numeric"
            className="h-11 w-32"
            aria-invalid={error("maxLength") ? true : undefined}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          id={`${id}-price`}
          label="Extra price (₹)"
          error={error("extraPrice")}
          help="Added to the item's price"
        >
          <Input
            id={`${id}-price`}
            value={values.extraPrice}
            onChange={(e) => set("extraPrice", e.target.value)}
            inputMode="decimal"
            className="h-11"
            aria-invalid={error("extraPrice") ? true : undefined}
          />
        </Field>
        <Field
          id={`${id}-cost`}
          label="Extra cost (₹)"
          error={error("extraCost")}
          help="Added to the cost to make"
        >
          <Input
            id={`${id}-cost`}
            value={values.extraCost}
            onChange={(e) => set("extraCost", e.target.value)}
            inputMode="decimal"
            className="h-11"
            aria-invalid={error("extraCost") ? true : undefined}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          Which categories can use it?
        </legend>
        {shownCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No categories yet.{" "}
            <Link href="/settings/categories" className="underline">
              Add one first
            </Link>
            .
          </p>
        ) : (
          shownCategories.map((category) => (
            <label
              key={category.id}
              className="flex h-11 cursor-pointer items-center gap-3"
            >
              <input
                type="checkbox"
                checked={values.categoryIds.includes(category.id)}
                onChange={(e) => toggleCategory(category.id, e.target.checked)}
                className="size-5 accent-foreground"
              />
              {category.name}
              {!category.active && (
                <span className="text-sm text-muted-foreground">
                  (inactive)
                </span>
              )}
            </label>
          ))
        )}
        {error("categoryIds") && (
          <p className="text-sm text-destructive">{error("categoryIds")}</p>
        )}
      </fieldset>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={cn(
            "text-sm",
            message.ok ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {message.text}
        </p>
      )}
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : optionId ? "Save" : "Create option"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {(error ?? help) && (
        <p
          className={cn(
            "text-sm",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error ?? help}
        </p>
      )}
    </div>
  );
}
