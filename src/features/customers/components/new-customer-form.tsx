"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { FormField, FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateThenRun } from "@/lib/client-action";
import { INDIAN_STATES } from "@/lib/indian-states";
import { useActionForm } from "@/lib/use-action-form";
import { cn } from "@/lib/utils";
import {
  checkCustomerDuplicates,
  createCustomer,
  type Duplicates,
} from "../actions";
import {
  createCustomerSchema,
  CUSTOMER_SOURCES,
  SOURCE_LABELS,
  type CreateCustomerInput,
} from "../schema";

const EMPTY: CreateCustomerInput = {
  mobile: "",
  instagramHandle: "",
  firstName: "",
  lastName: "",
  source: "instagram",
  altMobile: "",
  email: "",
  notes: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "" as CreateCustomerInput["state"],
  pin: "",
};

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

type TextKey = Exclude<keyof CreateCustomerInput, "source" | "state">;

/** Add a customer with their first address (§2.1); warns as soon as a mobile or handle is taken. */
export function NewCustomerForm() {
  const id = useId();
  const form = useActionForm(EMPTY, (values) =>
    validateThenRun(createCustomerSchema, values, createCustomer),
  );
  const { values, set, error } = form;
  const [duplicates, setDuplicates] = useState<Duplicates>({});
  const checked = useRef({ mobile: "", instagramHandle: "" });

  /** On leaving the mobile or handle field: does someone already have it? */
  async function checkDuplicates() {
    const query = {
      mobile: values.mobile,
      instagramHandle: values.instagramHandle,
    };
    if (
      query.mobile === checked.current.mobile &&
      query.instagramHandle === checked.current.instagramHandle
    ) {
      return;
    }
    checked.current = query;
    try {
      const result = await checkCustomerDuplicates(query);
      if (result?.ok) setDuplicates(result.data);
    } catch {
      // Only a hint: saving checks again and reports duplicates on the fields.
    }
  }

  function text(key: TextKey, label: string, options: TextOptions = {}) {
    const fieldId = `${id}-${key}`;
    const duplicate =
      key === "mobile" || key === "instagramHandle"
        ? duplicates[key]
        : undefined;
    return (
      <FormField
        id={fieldId}
        label={label}
        error={error(key)}
        help={duplicate ? undefined : options.help}
      >
        <Input
          id={fieldId}
          value={values[key]}
          onChange={(e) => {
            set(key, e.target.value);
            if (duplicate) setDuplicates((d) => ({ ...d, [key]: undefined }));
          }}
          onBlur={options.checkDuplicates ? checkDuplicates : undefined}
          inputMode={options.inputMode}
          type={options.type}
          autoComplete={options.autoComplete ?? "off"}
          autoCapitalize={options.autoCapitalize}
          spellCheck={options.autoCapitalize === "none" ? false : undefined}
          className={cn("h-11", options.className)}
          aria-invalid={error(key) ? true : undefined}
          aria-describedby={`${fieldId}-note`}
        />
        {duplicate && !error(key) && (
          <p
            id={`${fieldId}-note`}
            role="status"
            className="text-sm text-amber-700 dark:text-amber-400"
          >
            Already used by{" "}
            <Link href={`/customers/${duplicate.id}`} className="underline">
              {duplicate.code} {duplicate.name}
            </Link>
            .
          </p>
        )}
      </FormField>
    );
  }

  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-6"
    >
      {text("mobile", "Mobile", {
        inputMode: "tel",
        type: "tel",
        checkDuplicates: true,
        help: "10 digits; +91 and spaces are fine",
      })}
      {text("instagramHandle", "Instagram handle (optional)", {
        autoCapitalize: "none",
        checkDuplicates: true,
        help: "With or without @, or paste their profile link",
      })}
      <div className="grid grid-cols-2 gap-3">
        {text("firstName", "First name", { autoCapitalize: "words" })}
        {text("lastName", "Last name (optional)", { autoCapitalize: "words" })}
      </div>
      <FormField
        id={`${id}-source`}
        label="Where did they find you?"
        error={error("source")}
      >
        <select
          id={`${id}-source`}
          value={values.source}
          onChange={(e) =>
            set("source", e.target.value as CreateCustomerInput["source"])
          }
          className={selectClass}
          aria-invalid={error("source") ? true : undefined}
          aria-describedby={`${id}-source-note`}
        >
          {CUSTOMER_SOURCES.map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABELS[source]}
            </option>
          ))}
        </select>
      </FormField>

      <fieldset className="flex flex-col gap-4 border-t pt-6">
        <legend className="float-left mb-2 font-heading text-lg font-semibold">
          Address
        </legend>
        {text("line1", "House / flat no., building", {
          autoComplete: "address-line1",
        })}
        {text("line2", "Street / area (optional)", {
          autoComplete: "address-line2",
        })}
        {text("landmark", "Landmark (optional)", {
          help: "e.g. Near Hanuman temple",
        })}
        <div className="grid grid-cols-2 gap-3">
          {text("city", "City", { autoComplete: "address-level2" })}
          {text("pin", "PIN code", {
            inputMode: "numeric",
            autoComplete: "postal-code",
          })}
        </div>
        <FormField id={`${id}-state`} label="State" error={error("state")}>
          <select
            id={`${id}-state`}
            value={values.state}
            onChange={(e) =>
              set("state", e.target.value as CreateCustomerInput["state"])
            }
            autoComplete="address-level1"
            className={selectClass}
            aria-invalid={error("state") ? true : undefined}
            aria-describedby={`${id}-state-note`}
          >
            <option value="" disabled>
              Choose a state
            </option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t pt-6">
        <legend className="float-left mb-2 font-heading text-lg font-semibold">
          More (optional)
        </legend>
        {text("altMobile", "Alternate mobile", {
          inputMode: "tel",
          type: "tel",
        })}
        {text("email", "Email", {
          inputMode: "email",
          type: "email",
          autoCapitalize: "none",
        })}
        <FormField
          id={`${id}-notes`}
          label="Notes"
          error={error("notes")}
          help="e.g. prefers pastel colours"
        >
          <textarea
            id={`${id}-notes`}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className={cn(selectClass, "h-auto py-2")}
            aria-invalid={error("notes") ? true : undefined}
            aria-describedby={`${id}-notes-note`}
          />
        </FormField>
      </fieldset>

      <FormMessage message={form.message} />
      <Button type="submit" className="h-11" disabled={form.pending}>
        {form.pending ? "Saving…" : "Add customer"}
      </Button>
    </form>
  );
}

type TextOptions = {
  help?: string;
  inputMode?: "tel" | "numeric" | "email";
  type?: "tel" | "email";
  autoComplete?: string;
  autoCapitalize?: "none" | "words";
  checkDuplicates?: boolean;
  className?: string;
};
