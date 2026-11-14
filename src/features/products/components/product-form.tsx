"use client";

import Link from "next/link";
import { useId } from "react";
import { FormMessage } from "@/components/form-field";
import { SelectField, TextField, type Bind } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { validateThenRun } from "@/lib/client-action";
import { formatMoney, parseMoney } from "@/lib/money";
import { useActionForm } from "@/lib/use-action-form";
import { cn } from "@/lib/utils";
import { createProduct, updateProduct } from "../actions";
import type { Choice, ProductFormChoices } from "../queries";
import {
  margin,
  productSchema,
  updateProductSchema,
  type ProductInput,
} from "../schema";

export const EMPTY_PRODUCT: ProductInput = {
  sku: "",
  name: "",
  categoryId: "",
  typeId: "",
  colourId: "",
  designId: "",
  length: "",
  width: "",
  height: "",
  weight: "",
  price: "",
  cost: "",
  optionIds: [],
};

/** Active entries, plus `current` if it's inactive (so editing doesn't drop it). */
function selectable(choices: Choice[], current: string) {
  return choices
    .filter((c) => c.active || c.id === current)
    .map((c) => ({
      value: c.id,
      label: c.active ? c.name : `${c.name} (inactive)`,
    }));
}

type Props = {
  /** Present when editing. */
  productId?: string;
  initial: ProductInput;
  choices: ProductFormChoices;
};

/** Add or edit a product (§2.2). */
export function ProductForm({ productId, initial, choices }: Props) {
  const idPrefix = useId();
  const form = useActionForm(initial, (values) =>
    productId
      ? validateThenRun(
          updateProductSchema,
          { ...values, id: productId },
          updateProduct,
        )
      : validateThenRun(productSchema, values, createProduct),
  );
  const { values } = form;

  const bind: Bind<ProductInput> = {
    idPrefix,
    values,
    error: form.error,
    set: (key, value) => {
      form.set(key, value as never);
      if (key === "categoryId") {
        // Options belong to categories: keep only those the new category offers.
        form.set(
          "optionIds",
          values.optionIds.filter((id) =>
            choices.options.some(
              (o) => o.id === id && o.categoryIds.includes(value),
            ),
          ),
        );
      }
    },
  };

  const noneFirst = (list: { value: string; label: string }[]) => [
    { value: "", label: "None" },
    ...list,
  ];
  // The chosen category's options (inactive ones only if already offered), plus any the
  // product offers that Settings has since taken off this category: shown so they can be
  // unticked, and allowed to stay (the server keeps them while the category is unchanged).
  const sameCategory = values.categoryId === initial.categoryId;
  const options = choices.options
    .filter(
      (o) =>
        (o.categoryIds.includes(values.categoryId) &&
          (o.active || initial.optionIds.includes(o.id))) ||
        (sameCategory && initial.optionIds.includes(o.id)),
    )
    .map((o) => ({
      ...o,
      notForCategory: !o.categoryIds.includes(values.categoryId),
    }));

  const price = parseMoney(values.price);
  const cost = parseMoney(values.cost);
  const m = price !== null && cost !== null ? margin(price, cost) : null;

  function toggleOption(id: string, checked: boolean) {
    form.set(
      "optionIds",
      checked
        ? [...values.optionIds, id]
        : values.optionIds.filter((o) => o !== id),
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
        name="sku"
        label="Product ID"
        help="e.g. BOX-SQ-RED-01; saved in capitals"
        autoCapitalize="none"
      />
      <TextField bind={bind} name="name" label="Name" />
      <SelectField
        bind={bind}
        name="categoryId"
        label="Category"
        options={selectable(choices.categories, initial.categoryId)}
        placeholder="Choose a category"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          bind={bind}
          name="typeId"
          label="Type"
          options={noneFirst(selectable(choices.types, initial.typeId))}
        />
        <SelectField
          bind={bind}
          name="colourId"
          label="Colour"
          options={noneFirst(selectable(choices.colours, initial.colourId))}
        />
      </div>
      <SelectField
        bind={bind}
        name="designId"
        label="Design"
        options={noneFirst(selectable(choices.designs, initial.designId))}
      />

      <fieldset className="flex flex-col gap-4 border-t pt-6">
        <legend className="float-left mb-2 font-heading text-lg font-semibold">
          Price
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            bind={bind}
            name="price"
            label="Selling price (₹)"
            inputMode="decimal"
            help="Before customisations"
          />
          <TextField
            bind={bind}
            name="cost"
            label="Cost to make (₹)"
            inputMode="decimal"
            help="Materials + labour"
          />
        </div>
        <p
          className={cn(
            "text-sm",
            m && m.paise < 0 ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {m
            ? `Margin ${formatMoney(m.paise)}${m.percent === null ? "" : ` (${m.percent}%)`}`
            : "Margin shows once both are filled in."}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t pt-6">
        <legend className="float-left mb-2 font-heading text-lg font-semibold">
          Size and weight (optional)
        </legend>
        <div className="grid grid-cols-3 gap-3">
          <TextField
            bind={bind}
            name="length"
            label="Length (cm)"
            inputMode="decimal"
          />
          <TextField
            bind={bind}
            name="width"
            label="Width (cm)"
            inputMode="decimal"
          />
          <TextField
            bind={bind}
            name="height"
            label="Height (cm)"
            inputMode="decimal"
          />
        </div>
        <TextField
          bind={bind}
          name="weight"
          label="Weight (g)"
          inputMode="numeric"
          help="Packed, for courier charges"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-t pt-6">
        <legend className="float-left mb-2 font-heading text-lg font-semibold">
          Customisations offered
        </legend>
        {values.categoryId === "" ? (
          <p className="text-sm text-muted-foreground">
            Choose a category first.
          </p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None for this category.{" "}
            <Link href="/settings/customisations" className="underline">
              Set them up in Settings
            </Link>
            .
          </p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex h-11 cursor-pointer items-center gap-3"
            >
              <input
                type="checkbox"
                checked={values.optionIds.includes(option.id)}
                onChange={(e) => toggleOption(option.id, e.target.checked)}
                className="size-5 accent-foreground"
              />
              {option.name}
              {option.notForCategory ? (
                <span className="text-sm text-muted-foreground">
                  (no longer offered for this category)
                </span>
              ) : (
                !option.active && (
                  <span className="text-sm text-muted-foreground">
                    (inactive)
                  </span>
                )
              )}
            </label>
          ))
        )}
        {form.error("optionIds") && (
          <p className="text-sm text-destructive">{form.error("optionIds")}</p>
        )}
      </fieldset>

      <FormMessage message={form.message} />
      <Button type="submit" className="h-11" disabled={form.pending}>
        {form.pending ? "Saving…" : productId ? "Save" : "Add product"}
      </Button>
    </form>
  );
}
