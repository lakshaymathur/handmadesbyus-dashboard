"use client";

import { SelectField, TextField, type Bind } from "@/components/form-fields";
import { INDIAN_STATES } from "@/lib/indian-states";
import type { AddressInput } from "../schema";

const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s, label: s }));

/** The address fields (§2.1), in the order people say an Indian address. */
export function AddressFields<Values extends AddressInput>({
  bind,
}: {
  bind: Bind<Values>;
}) {
  return (
    <>
      <TextField
        bind={bind}
        name="line1"
        label="House / flat no., building"
        autoComplete="address-line1"
      />
      <TextField
        bind={bind}
        name="line2"
        label="Street / area (optional)"
        autoComplete="address-line2"
      />
      <TextField
        bind={bind}
        name="landmark"
        label="Landmark (optional)"
        help="e.g. Near Hanuman temple"
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          bind={bind}
          name="city"
          label="City"
          autoComplete="address-level2"
        />
        <TextField
          bind={bind}
          name="pin"
          label="PIN code"
          inputMode="numeric"
          autoComplete="postal-code"
        />
      </div>
      <SelectField
        bind={bind}
        name="state"
        label="State"
        options={STATE_OPTIONS}
        placeholder="Choose a state"
        autoComplete="address-level1"
      />
    </>
  );
}

export const EMPTY_ADDRESS: AddressInput = {
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "" as AddressInput["state"],
  pin: "",
};
