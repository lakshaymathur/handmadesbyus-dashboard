"use client";

import { useId, useState, useTransition } from "react";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { validateThenRun } from "@/lib/client-action";
import { useActionForm } from "@/lib/use-action-form";
import {
  addAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "../actions";
import {
  addAddressSchema,
  addressIdSchema,
  updateAddressSchema,
  type AddressInput,
} from "../schema";
import type { Bind } from "@/components/form-fields";
import { AddressFields, EMPTY_ADDRESS } from "./address-fields";

type Props =
  | { mode: "add"; customerId: string }
  | { mode: "edit"; addressId: string; initial: AddressInput };

/** Add an address to a customer, or change one. Saving goes back to the customer. */
export function AddressForm(props: Props) {
  const idPrefix = useId();
  const [makeDefault, setMakeDefault] = useState(false);
  const form = useActionForm(
    props.mode === "edit" ? props.initial : EMPTY_ADDRESS,
    (values) =>
      props.mode === "add"
        ? validateThenRun(
            addAddressSchema,
            { ...values, customerId: props.customerId, makeDefault },
            addAddress,
          )
        : validateThenRun(
            updateAddressSchema,
            { ...values, id: props.addressId },
            updateAddress,
          ),
  );
  const bind: Bind<AddressInput> = {
    idPrefix,
    values: form.values,
    error: form.error,
    set: (key, value) => form.set(key, value as never),
  };

  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-4"
    >
      <AddressFields bind={bind} />
      {props.mode === "add" && (
        <label className="flex h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
            className="size-5 accent-foreground"
          />
          Make this the default address
        </label>
      )}
      <FormMessage message={form.message} />
      <Button type="submit" className="mt-2 h-11" disabled={form.pending}>
        {form.pending
          ? "Saving…"
          : props.mode === "add"
            ? "Add address"
            : "Save"}
      </Button>
    </form>
  );
}

/** "Make default" and "Delete" for one address on the customer page. */
export function AddressButtons({
  addressId,
  isDefault,
  isOnly,
}: {
  addressId: string;
  isDefault: boolean;
  isOnly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  function run(action: typeof setDefaultAddress) {
    setMessage(null);
    startTransition(async () => {
      const result = await validateThenRun(
        addressIdSchema,
        { id: addressId },
        action,
      );
      if (result && !result.ok) setMessage({ ok: false, text: result.error });
    });
  }

  return (
    <>
      {!isDefault && (
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={pending}
          onClick={() => run(setDefaultAddress)}
        >
          Make default
        </Button>
      )}
      {!isOnly && (
        <Button
          type="button"
          variant="outline"
          className="h-10 text-destructive"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                "Delete this address? Past orders keep their copy.",
              )
            ) {
              run(deleteAddress);
            }
          }}
        >
          Delete
        </Button>
      )}
      {message && (
        <div className="basis-full">
          <FormMessage message={message} />
        </div>
      )}
    </>
  );
}
