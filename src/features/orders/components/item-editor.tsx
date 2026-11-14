"use client";

import { Package, Search } from "lucide-react";
import { useId, useState } from "react";
import { FormField } from "@/components/form-field";
import { selectClass } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogueProduct } from "@/features/products/queries";
import { formatMoney, paiseToInput } from "@/lib/money";
import { toFormErrors } from "@/lib/validation";
import { cn } from "@/lib/utils";
import {
  orderItemSchema,
  type ItemCustomisationInput,
  type OrderItemInput,
} from "../schema";

type Props = {
  catalogue: CatalogueProduct[];
  /** The item being edited, or null to add one. */
  item: OrderItemInput | null;
  onSave: (item: OrderItemInput) => void;
  onCancel: () => void;
};

/** Add or change one order item (§2.5): product, quantity, price, customisations, notes. */
export function ItemEditor({ catalogue, item, onSave, onCancel }: Props) {
  const [productId, setProductId] = useState(item?.productId ?? null);
  const product = catalogue.find((p) => p.id === productId) ?? null;

  if (!product) {
    return (
      <ProductPicker
        catalogue={catalogue}
        onPick={(p) => setProductId(p.id)}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ItemDetails
      key={product.id}
      product={product}
      item={item?.productId === product.id ? item : null}
      onChangeProduct={item ? undefined : () => setProductId(null)}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function ProductPicker({
  catalogue,
  onPick,
  onCancel,
}: {
  catalogue: CatalogueProduct[];
  onPick: (product: CatalogueProduct) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = [
    ...new Map(catalogue.map((p) => [p.categoryId, p.category])).entries(),
  ];
  const q = query.trim().toLowerCase();
  const shown = catalogue.filter(
    (p) =>
      !p.archived &&
      (category === "" || p.categoryId === category) &&
      (q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Choose a product</h3>
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or product ID"
          aria-label="Find a product"
          autoComplete="off"
          className="h-11 pl-9"
        />
      </div>
      {categories.length > 1 && (
        <div
          role="group"
          aria-label="Category"
          className="flex flex-wrap gap-2"
        >
          {[["", "All"] as const, ...categories].map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              aria-pressed={category === id}
              className={cn(
                "h-9 rounded-full border px-3 text-sm",
                category === id
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No product matches.
        </p>
      ) : (
        <ul className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-lg border">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-14 w-full items-center gap-3 px-2 py-2 text-left hover:bg-muted"
              >
                <Thumbnail url={p.thumbnailUrl} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium wrap-anywhere">
                    {p.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.sku} · {p.category}
                  </span>
                </span>
                <span className="text-sm font-medium">
                  {formatMoney(p.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Thumbnail({
  url,
  size = "size-11",
}: {
  url: string | null;
  size?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
        size,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos come from /api/photos, which needs the session cookie; the image optimiser fetches without it
        <img
          src={url}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <Package className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

function ItemDetails({
  product,
  item,
  onChangeProduct,
  onSave,
  onCancel,
}: {
  product: CatalogueProduct;
  item: OrderItemInput | null;
  onChangeProduct?: () => void;
  onSave: (item: OrderItemInput) => void;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const [quantity, setQuantity] = useState(item?.quantity ?? "1");
  const [unitPrice, setUnitPrice] = useState(
    item?.unitPrice ?? paiseToInput(product.price),
  );
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [chosen, setChosen] = useState<ItemCustomisationInput[]>(
    item?.customisations ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const pick = (optionId: string) =>
    chosen.find((c) => c.optionId === optionId);
  function setPick(optionId: string, value: ItemCustomisationInput | null) {
    setChosen((list) => [
      ...list.filter((c) => c.optionId !== optionId),
      ...(value ? [value] : []),
    ]);
    setErrors({});
  }

  function save() {
    // Every chosen choice/text option needs its value (the server checks again).
    for (const option of product.options) {
      const value = pick(option.id);
      if (!value) continue;
      if (option.inputType === "choice" && !value.choiceId) {
        setErrors({
          customisations: [`Choose a ${option.name.toLowerCase()} option`],
        });
        return;
      }
      if (option.inputType === "text" && !value.text?.trim()) {
        setErrors({
          customisations: [`Enter the ${option.name.toLowerCase()} text`],
        });
        return;
      }
    }
    const next: OrderItemInput = {
      ...(item?.id ? { id: item.id } : {}),
      productId: product.id,
      quantity,
      unitPrice,
      notes: notes ?? "",
      // Keep the product's order of options.
      customisations: product.options
        .map((o) => pick(o.id))
        .filter((c): c is ItemCustomisationInput => c !== undefined),
    };
    const parsed = orderItemSchema.safeParse(next);
    if (!parsed.success) {
      setErrors(toFormErrors(parsed.error).fieldErrors);
      return;
    }
    onSave(next);
  }

  const err = (key: string) => errors[key]?.[0];

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Thumbnail url={product.thumbnailUrl} size="size-14" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium wrap-anywhere">{product.name}</span>
          <span className="text-sm text-muted-foreground">
            {product.sku} · {formatMoney(product.price)}
          </span>
        </div>
        {onChangeProduct && (
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={onChangeProduct}
          >
            Change
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          id={`${idPrefix}-qty`}
          label="Quantity"
          error={err("quantity")}
        >
          <Input
            id={`${idPrefix}-qty`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="numeric"
            className="h-11"
            aria-invalid={err("quantity") ? true : undefined}
            aria-describedby={`${idPrefix}-qty-note`}
          />
        </FormField>
        <FormField
          id={`${idPrefix}-price`}
          label="Price each (₹)"
          error={err("unitPrice")}
          help="Before customisations"
        >
          <Input
            id={`${idPrefix}-price`}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal"
            className="h-11"
            aria-invalid={err("unitPrice") ? true : undefined}
            aria-describedby={`${idPrefix}-price-note`}
          />
        </FormField>
      </div>

      {product.options.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Customisations</legend>
          {product.options.map((option) => {
            const value = pick(option.id);
            const on = value !== undefined;
            return (
              <div key={option.id} className="flex flex-col gap-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setPick(
                        option.id,
                        e.target.checked
                          ? { optionId: option.id, choiceId: null, text: null }
                          : null,
                      )
                    }
                    className="size-5 accent-foreground"
                  />
                  <span className="flex-1">{option.name}</span>
                  <span className="text-sm text-muted-foreground">
                    +{formatMoney(option.extraPrice)}
                  </span>
                </label>
                {on && option.inputType === "choice" && (
                  <select
                    value={value.choiceId ?? ""}
                    onChange={(e) =>
                      setPick(option.id, {
                        ...value,
                        choiceId: e.target.value || null,
                      })
                    }
                    aria-label={`${option.name} option`}
                    className={cn(selectClass, "ml-8 w-auto")}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {option.choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {on && option.inputType === "text" && (
                  <Input
                    value={value.text ?? ""}
                    onChange={(e) =>
                      setPick(option.id, { ...value, text: e.target.value })
                    }
                    maxLength={option.maxLength ?? undefined}
                    placeholder={`Up to ${option.maxLength} characters`}
                    aria-label={`${option.name} text`}
                    className="ml-8 h-11 w-auto"
                  />
                )}
              </div>
            );
          })}
          {err("customisations") && (
            <p className="text-sm text-destructive">{err("customisations")}</p>
          )}
        </fieldset>
      )}

      <FormField
        id={`${idPrefix}-notes`}
        label="Item notes (optional)"
        help='e.g. "lining in gold"'
      >
        <Input
          id={`${idPrefix}-notes`}
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          className="h-11"
          aria-describedby={`${idPrefix}-notes-note`}
        />
      </FormField>

      <div className="flex gap-2">
        <Button type="button" className="h-11 flex-1" onClick={save}>
          {item ? "Update item" : "Add to order"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
