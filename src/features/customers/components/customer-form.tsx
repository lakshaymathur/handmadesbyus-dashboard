"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { validateThenRun } from "@/lib/client-action";
import { useActionForm } from "@/lib/use-action-form";
import {
  checkCustomerDuplicates,
  createCustomer,
  updateCustomer,
  type Duplicates,
} from "../actions";
import {
  createCustomerSchema,
  CUSTOMER_SOURCES,
  SOURCE_LABELS,
  updateCustomerSchema,
  type CreateCustomerInput,
  type CustomerInput,
} from "../schema";
import {
  AddressFields,
  EMPTY_ADDRESS,
  SelectField,
  TextArea,
  TextField,
  type Bind,
} from "./fields";

const SOURCE_OPTIONS = CUSTOMER_SOURCES.map((s) => ({
  value: s,
  label: SOURCE_LABELS[s],
}));

const EMPTY_CUSTOMER: CustomerInput = {
  mobile: "",
  instagramHandle: "",
  firstName: "",
  lastName: "",
  source: "instagram",
  altMobile: "",
  email: "",
  notes: "",
};

type Props =
  /** Adding: the customer and their first address. */
  | { customerId?: undefined; initial?: undefined }
  /** Editing an existing customer's own details. */
  | { customerId: string; initial: CustomerInput };

/**
 * Add a customer with their first address, or edit one's details (§2.1). Warns as soon as
 * a mobile or handle belongs to someone else (§3.3).
 */
export function CustomerForm({ customerId, initial }: Props) {
  const idPrefix = useId();
  const form = useActionForm<CreateCustomerInput>(
    { ...(initial ?? EMPTY_CUSTOMER), ...EMPTY_ADDRESS },
    ({ line1, line2, landmark, city, state, pin, ...customer }) =>
      customerId
        ? validateThenRun(
            updateCustomerSchema,
            { ...customer, id: customerId },
            updateCustomer,
          )
        : validateThenRun(
            createCustomerSchema,
            { ...customer, line1, line2, landmark, city, state, pin },
            createCustomer,
          ),
  );
  const [duplicates, setDuplicates] = useState<Duplicates>({});
  // The values last checked, so leaving a field unchanged doesn't ask again; and a
  // counter so a reply is only used if nothing was checked or edited after it was sent.
  const checked = useRef({
    mobile: initial?.mobile ?? "",
    instagramHandle: initial?.instagramHandle ?? "",
  });
  const latestCheck = useRef(0);

  const bind: Bind<CreateCustomerInput> = {
    idPrefix,
    values: form.values,
    error: form.error,
    set: (key, value) => {
      form.set(key, value as never);
      if (key === "mobile" || key === "instagramHandle") {
        setDuplicates(({ [key]: _cleared, ...rest }) => rest);
        // A reply still on its way is about the old value: ignore it, and check again
        // when the field is left.
        latestCheck.current++;
        checked.current = { mobile: "", instagramHandle: "" };
      }
    },
  };

  /** On leaving the mobile or handle field: does someone else already have it? */
  async function checkDuplicates() {
    const query = {
      mobile: form.values.mobile,
      instagramHandle: form.values.instagramHandle,
    };
    if (
      query.mobile === checked.current.mobile &&
      query.instagramHandle === checked.current.instagramHandle
    ) {
      return;
    }
    checked.current = query;
    const thisCheck = ++latestCheck.current;
    try {
      const result = await checkCustomerDuplicates({
        ...query,
        excludeId: customerId,
      });
      if (result?.ok && thisCheck === latestCheck.current) {
        setDuplicates(result.data);
      }
    } catch {
      // Only a hint: saving checks again and reports duplicates on the fields.
    }
  }

  function duplicateNote(key: keyof Duplicates) {
    const duplicate = duplicates[key];
    if (!duplicate) return undefined;
    return (
      <p className="text-amber-700 dark:text-amber-400">
        Already used by{" "}
        <Link href={`/customers/${duplicate.id}`} className="underline">
          {duplicate.code} {duplicate.name}
        </Link>
        .
      </p>
    );
  }

  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-6"
    >
      <TextField
        bind={bind}
        name="mobile"
        label="Mobile"
        type="tel"
        inputMode="tel"
        help="10 digits; +91 and spaces are fine"
        onBlur={checkDuplicates}
        note={duplicateNote("mobile")}
      />
      <TextField
        bind={bind}
        name="instagramHandle"
        label="Instagram handle (optional)"
        autoCapitalize="none"
        help="With or without @, or paste their profile link"
        onBlur={checkDuplicates}
        note={duplicateNote("instagramHandle")}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          bind={bind}
          name="firstName"
          label="First name"
          autoCapitalize="words"
        />
        <TextField
          bind={bind}
          name="lastName"
          label="Last name (optional)"
          autoCapitalize="words"
        />
      </div>
      <SelectField
        bind={bind}
        name="source"
        label="Where did they find you?"
        options={SOURCE_OPTIONS}
        // Only shown for customers saved without one (e.g. imported); can't be re-chosen.
        placeholder={initial?.source === "" ? "Not recorded" : undefined}
      />

      {!customerId && (
        <fieldset className="flex flex-col gap-4 border-t pt-6">
          <legend className="float-left mb-2 font-heading text-lg font-semibold">
            Address
          </legend>
          <AddressFields bind={bind} />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4 border-t pt-6">
        <legend className="float-left mb-2 font-heading text-lg font-semibold">
          More (optional)
        </legend>
        <TextField
          bind={bind}
          name="altMobile"
          label="Alternate mobile"
          type="tel"
          inputMode="tel"
        />
        <TextField
          bind={bind}
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
        />
        <TextArea
          bind={bind}
          name="notes"
          label="Notes"
          help="e.g. prefers pastel colours"
        />
      </fieldset>

      <FormMessage message={form.message} />
      <Button type="submit" className="h-11" disabled={form.pending}>
        {form.pending ? "Saving…" : customerId ? "Save" : "Add customer"}
      </Button>
    </form>
  );
}
