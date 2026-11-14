"use client";

import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { FormMessage } from "@/components/form-field";
import {
  selectClass,
  SelectField,
  TextArea,
  TextField,
  type Bind,
} from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { AddressFields } from "@/features/customers/components/address-fields";
import type { CustomerDetail } from "@/features/customers/queries";
import type { CatalogueProduct } from "@/features/products/queries";
import type { OrderItemDetail } from "../queries";
import { validateThenRun } from "@/lib/client-action";
import { formatMoney, parseMoney } from "@/lib/money";
import { useActionForm } from "@/lib/use-action-form";
import { createOrder, updateOrder } from "../actions";
import { orderTotals, type Discount } from "../pricing";
import {
  CHANNEL_LABELS,
  CHANNELS,
  discountOf,
  orderSchema,
  updateOrderSchema,
  type OrderInput,
  type OrderItemInput,
} from "../schema";
import { CustomerPicker } from "./customer-picker";
import { PriceBreakdown } from "./price-breakdown";
import { ItemEditor, Thumbnail } from "./item-editor";

const CHANNEL_OPTIONS = [
  { value: "", label: "Not recorded" },
  ...CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] })),
];

type Props = {
  catalogue: CatalogueProduct[];
  initial: OrderInput;
  /** The customer already chosen (editing or duplicating an order), if any. */
  initialCustomer: CustomerDetail | null;
  /** Editing: the order, and its items as saved (their snapshot prices). */
  orderId?: string;
  savedItems?: OrderItemDetail[];
};

type AddressKey = "line1" | "line2" | "landmark" | "city" | "state" | "pin";

/** The order's price per unit of an item: its price plus its customisations' today. */
/** A saved customisation that the item still has unchanged (it keeps its snapshot). */
function savedMatch(
  saved: OrderItemDetail | undefined,
  c: OrderItemInput["customisations"][number],
) {
  return saved?.customisations.find(
    (s) =>
      s.optionId === c.optionId &&
      s.choiceId === (c.choiceId ?? null) &&
      s.text === (c.text?.trim() || null),
  );
}

/**
 * The item's product as the form shows it: from the catalogue, plus (for a saved item)
 * any customisations or choices it has that Settings has since retired, so editing the
 * item keeps them.
 */
function productFor(
  item: OrderItemInput,
  catalogue: CatalogueProduct[],
  savedItems: OrderItemDetail[],
): CatalogueProduct | undefined {
  const base = catalogue.find((p) => p.id === item.productId);
  const saved = savedItems.find((s) => s.id === item.id);
  if (!base || !saved) return base;
  const options = [...base.options];
  for (const c of saved.customisations) {
    const index = options.findIndex((o) => o.id === c.optionId);
    const choice =
      c.choiceId && c.choiceName
        ? [{ id: c.choiceId, name: c.choiceName }]
        : [];
    const option = options[index];
    if (!option) {
      options.push({
        id: c.optionId,
        name: c.name,
        inputType: c.inputType,
        maxLength: c.text?.length ?? null,
        extraPrice: c.price,
        choices: choice,
      });
    } else if (
      c.choiceId &&
      !option.choices.some((ch) => ch.id === c.choiceId)
    ) {
      options[index] = { ...option, choices: [...option.choices, ...choice] };
    }
  }
  return { ...base, options };
}

/** Price per unit of an item: saved customisations at their saved price, others today's. */
function itemPricing(
  item: OrderItemInput,
  catalogue: CatalogueProduct[],
  savedItems: OrderItemDetail[],
) {
  const product = productFor(item, catalogue, savedItems);
  const saved = savedItems.find((s) => s.id === item.id);
  return {
    quantity: Number(item.quantity),
    unitPrice: parseMoney(item.unitPrice) ?? 0,
    unitCost: 0,
    customisations: item.customisations.map((c) => ({
      price:
        savedMatch(saved, c)?.price ??
        product?.options.find((o) => o.id === c.optionId)?.extraPrice ??
        0,
      cost: 0,
    })),
  };
}

/** Create an order (§2.4, §3.2): customer, items, delivery and dates, price. */
export function OrderForm({
  catalogue,
  initial,
  initialCustomer,
  orderId,
  savedItems = [],
}: Props) {
  const idPrefix = useId();
  const form = useActionForm<OrderInput>(initial, (values) =>
    orderId
      ? validateThenRun(updateOrderSchema, { ...values, orderId }, updateOrder)
      : validateThenRun(orderSchema, values, createOrder),
  );
  const { values } = form;
  const [customer, setCustomer] = useState(initialCustomer);
  // Index of the item being edited, "new" while adding, or null.
  const [editing, setEditing] = useState<number | "new" | null>(
    initial.items.length === 0 ? "new" : null,
  );

  const bind: Bind<OrderInput> = {
    idPrefix,
    values,
    error: form.error,
    set: (key, value) => form.set(key, value as never),
  };

  function chooseCustomer(chosen: CustomerDetail | null) {
    setCustomer(chosen);
    form.set("customerId", chosen?.id ?? "");
    const address = chosen?.addresses[0]; // the default comes first
    if (address) fillAddress(address);
  }

  function fillAddress(address: CustomerDetail["addresses"][number]) {
    const fields: [AddressKey, string][] = [
      ["line1", address.line1],
      ["line2", address.line2 ?? ""],
      ["landmark", address.landmark ?? ""],
      ["city", address.city],
      ["state", address.state],
      ["pin", address.pin],
    ];
    for (const [key, value] of fields) form.set(key, value as never);
  }

  function saveItem(item: OrderItemInput) {
    const items =
      editing === "new" || editing === null
        ? [...values.items, item]
        : values.items.map((existing, i) => (i === editing ? item : existing));
    form.set("items", items);
    setEditing(null);
  }

  // Live breakdown (§3.2). Unreadable amounts count as 0 until they're fixed.
  const discount: Discount = discountOf(values) ?? { type: "none" };
  const totals = orderTotals({
    items: values.items
      .map((item) => itemPricing(item, catalogue, savedItems))
      .filter((i) => Number.isInteger(i.quantity) && i.quantity >= 1),
    discount,
    shippingCharged: parseMoney(values.shippingCharged) ?? 0,
  });

  return (
    <div className="flex flex-col gap-6">
      <section
        className="flex flex-col gap-3"
        aria-labelledby={`${idPrefix}-customer`}
      >
        <h2
          id={`${idPrefix}-customer`}
          className="font-heading text-lg font-semibold"
        >
          Customer
        </h2>
        <CustomerPicker
          selected={customer}
          onSelect={chooseCustomer}
          error={form.error("customerId")}
        />
      </section>

      <form
        method="post"
        onSubmit={form.submit}
        noValidate
        className="flex flex-col gap-6"
      >
        <section
          className="flex flex-col gap-3 border-t pt-6"
          aria-labelledby={`${idPrefix}-items`}
        >
          <h2
            id={`${idPrefix}-items`}
            className="font-heading text-lg font-semibold"
          >
            Items
          </h2>
          {values.items.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {values.items.map((item, index) => {
                const product = productFor(item, catalogue, savedItems);
                const pricing = itemPricing(item, catalogue, savedItems);
                const itemError =
                  form.error(`items.${index}.productId`) ??
                  form.error(`items.${index}.customisations`) ??
                  form.error(`items.${index}.quantity`) ??
                  form.error(`items.${index}.unitPrice`);
                if (editing === index) {
                  return (
                    <li key={index} className="p-2">
                      <ItemEditor
                        catalogue={catalogue.map((p) =>
                          p.id === item.productId && product ? product : p,
                        )}
                        item={item}
                        onSave={saveItem}
                        onCancel={() => setEditing(null)}
                      />
                    </li>
                  );
                }
                return (
                  <li key={index} className="flex flex-col gap-2 p-3">
                    <div className="flex items-start gap-3">
                      <Thumbnail url={product?.thumbnailUrl ?? null} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium wrap-anywhere">
                          {product?.name ?? "Unknown product"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {item.quantity} × {formatMoney(pricing.unitPrice)}
                          {item.customisations.length > 0 &&
                            ` + ${customisationSummary(item, product)}`}
                        </span>
                        {item.notes && (
                          <span className="text-sm wrap-anywhere text-muted-foreground">
                            {item.notes}
                          </span>
                        )}
                      </div>
                      <span className="font-medium">
                        {formatMoney(
                          Number.isInteger(pricing.quantity)
                            ? (pricing.unitPrice +
                                pricing.customisations.reduce(
                                  (a, c) => a + c.price,
                                  0,
                                )) *
                                pricing.quantity
                            : 0,
                        )}
                      </span>
                    </div>
                    {itemError && (
                      <p className="text-sm text-destructive">{itemError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        onClick={() => setEditing(index)}
                        disabled={editing !== null}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 text-destructive"
                        onClick={() =>
                          form.set(
                            "items",
                            values.items.filter((_, i) => i !== index),
                          )
                        }
                        disabled={editing !== null}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {editing === "new" ? (
            <ItemEditor
              catalogue={catalogue}
              item={null}
              onSave={saveItem}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:w-fit"
              onClick={() => setEditing("new")}
              disabled={editing !== null}
            >
              <Plus aria-hidden />
              Add item
            </Button>
          )}
          {form.error("items") && (
            <p className="text-sm text-destructive">{form.error("items")}</p>
          )}
        </section>

        <section
          className="flex flex-col gap-4 border-t pt-6"
          aria-labelledby={`${idPrefix}-delivery`}
        >
          <h2
            id={`${idPrefix}-delivery`}
            className="font-heading text-lg font-semibold"
          >
            Delivery
          </h2>
          {customer && customer.addresses.length > 1 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Use a saved address</span>
              <select
                className={selectClass}
                defaultValue=""
                onChange={(e) => {
                  const address = customer.addresses.find(
                    (a) => a.id === e.target.value,
                  );
                  if (address) fillAddress(address);
                }}
              >
                <option value="" disabled>
                  Choose one of {customer.name}&rsquo;s addresses
                </option>
                {customer.addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.line1}, {a.city}
                    {a.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AddressFields bind={bind} />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              bind={bind}
              name="orderDate"
              label="Order date"
              type="date"
            />
            <TextField
              bind={bind}
              name="promisedDate"
              label="Promised by"
              type="date"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              bind={bind}
              name="priority"
              label="Priority"
              options={[
                { value: "normal", label: "Normal" },
                { value: "urgent", label: "Urgent" },
              ]}
            />
            <SelectField
              bind={bind}
              name="channel"
              label="Ordered via"
              options={CHANNEL_OPTIONS}
            />
          </div>
        </section>

        <section
          className="flex flex-col gap-4 border-t pt-6"
          aria-labelledby={`${idPrefix}-price`}
        >
          <h2
            id={`${idPrefix}-price`}
            className="font-heading text-lg font-semibold"
          >
            Price
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              bind={bind}
              name="discountType"
              label="Discount"
              options={[
                { value: "none", label: "None" },
                { value: "flat", label: "Amount (₹)" },
                { value: "percent", label: "Percent (%)" },
              ]}
            />
            {values.discountType !== "none" && (
              <TextField
                bind={bind}
                name="discountValue"
                label={
                  values.discountType === "flat"
                    ? "Discount (₹)"
                    : "Discount (%)"
                }
                inputMode="decimal"
              />
            )}
          </div>
          <TextField
            bind={bind}
            name="shippingCharged"
            label="Shipping charged (₹)"
            inputMode="decimal"
            help="0 for free shipping"
          />
          <PriceBreakdown
            totals={totals}
            warning={
              discount.type === "flat" && discount.paise > totals.subtotal
                ? "The discount is more than the items' total; it can't be saved like this."
                : null
            }
            className="rounded-lg bg-muted p-3"
          />
          <TextArea
            bind={bind}
            name="notes"
            label="Notes (optional)"
            help="Internal; the customer doesn't see them"
          />
        </section>

        <FormMessage message={form.message} />
        <Button
          type="submit"
          className="h-11"
          disabled={form.pending || editing !== null}
        >
          {form.pending ? "Saving…" : orderId ? "Save changes" : "Create order"}
        </Button>
        {editing !== null && (
          <p className="text-sm text-muted-foreground">
            Finish or cancel the item first.
          </p>
        )}
      </form>
    </div>
  );
}

/** "Latkan (Gold), Sticker “Happy Birthday”" */
function customisationSummary(
  item: OrderItemInput,
  product: CatalogueProduct | undefined,
) {
  return item.customisations
    .map((c) => {
      const option = product?.options.find((o) => o.id === c.optionId);
      if (!option) return null;
      if (option.inputType === "choice") {
        const choice = option.choices.find((ch) => ch.id === c.choiceId);
        return choice ? `${option.name} (${choice.name})` : option.name;
      }
      if (option.inputType === "text") return `${option.name} “${c.text}”`;
      return option.name;
    })
    .filter(Boolean)
    .join(", ");
}
