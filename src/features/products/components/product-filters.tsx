"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { selectClass } from "@/components/form-fields";
import { cn } from "@/lib/utils";
import type { Choice } from "../queries";
import {
  productsUrl,
  type ProductFilters,
  type ProductStatus,
} from "../schema";

const STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Active",
  archived: "Archived",
  all: "All",
};

type Props = {
  filters: ProductFilters;
  categories: Choice[];
  types: Choice[];
  colours: Choice[];
};

/** Filter by category, type, colour and active/archived (§3.4); kept in the URL. */
export function ProductFilterBar({
  filters,
  categories,
  types,
  colours,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Show the new choice at once; the list catches up when the page has loaded.
  const [shown, setShown] = useOptimistic(filters);

  function apply(next: ProductFilters) {
    startTransition(() => {
      setShown(next);
      router.replace(productsUrl(next), { scroll: false });
    });
  }

  const select = (
    key: "categoryId" | "typeId" | "colourId",
    label: string,
    choices: Choice[],
  ) => (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={shown[key] ?? ""}
        onChange={(e) =>
          apply({ ...shown, [key]: e.target.value || undefined })
        }
        className={cn(selectClass, "h-10")}
      >
        <option value="">All</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.active ? c.name : `${c.name} (inactive)`}
          </option>
        ))}
      </select>
    </label>
  );

  const filtered =
    shown.categoryId ||
    shown.typeId ||
    shown.colourId ||
    shown.status !== "active";

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
      <div className="grid grid-cols-3 gap-2">
        {select("categoryId", "Category", categories)}
        {select("typeId", "Type", types)}
        {select("colourId", "Colour", colours)}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Show"
          className="flex rounded-lg border p-0.5 text-sm"
        >
          {(Object.keys(STATUS_LABELS) as ProductStatus[]).map((status) => (
            <Link
              key={status}
              href={productsUrl({ ...shown, status })}
              replace
              scroll={false}
              aria-current={shown.status === status ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                apply({ ...shown, status });
              }}
              className={cn(
                "flex h-9 items-center rounded-md px-3",
                shown.status === status
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {STATUS_LABELS[status]}
            </Link>
          ))}
        </div>
        {filtered && (
          <Link
            href="/products"
            replace
            scroll={false}
            onClick={(e) => {
              e.preventDefault();
              apply({ status: "active" });
            }}
            className="flex h-9 items-center px-2 text-sm underline"
          >
            Clear filters
          </Link>
        )}
      </div>
    </div>
  );
}
