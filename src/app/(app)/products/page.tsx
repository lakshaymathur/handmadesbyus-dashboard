import { Package, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ProductFilterBar } from "@/features/products/components/product-filters";
import {
  getProductFilterChoices,
  getProducts,
  type ProductSummary,
} from "@/features/products/queries";
import {
  parseProductFilters,
  type ProductFilters,
} from "@/features/products/schema";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products · HandMadesByUs" };

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Products"
        action={
          <Link
            href="/products/new"
            className={buttonVariants({ className: "h-11" })}
          >
            <Plus aria-hidden />
            Add
          </Link>
        }
      />
      {/* Filters come from the URL, so they're read inside <Suspense>. */}
      <Suspense fallback={<GridSkeleton withFilters />}>
        <FiltersAndGrid searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function GridSkeleton({ withFilters = false }: { withFilters?: boolean }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {withFilters && (
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-[3/4] animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    </div>
  );
}

async function FiltersAndGrid({
  searchParams,
}: Pick<PageProps<"/products">, "searchParams">) {
  const filters = parseProductFilters(await searchParams);
  // Independent: load the dropdowns and the products together.
  const [choices, products] = await Promise.all([
    getProductFilterChoices(),
    getProducts(filters),
  ]);
  return (
    <>
      <ProductFilterBar
        filters={filters}
        categories={choices.categories}
        types={choices.types}
        colours={choices.colours}
      />
      <Grid filters={filters} products={products} />
    </>
  );
}

function Grid({
  filters,
  products,
}: {
  filters: ProductFilters;
  products: ProductSummary[];
}) {
  if (products.length === 0) {
    const unfiltered =
      !filters.categoryId &&
      !filters.typeId &&
      !filters.colourId &&
      filters.status === "active";
    return (
      <p className="py-6 text-center text-muted-foreground">
        {unfiltered ? (
          <>
            No products yet.{" "}
            <Link href="/products/new" className="underline">
              Add the first one
            </Link>
          </>
        ) : (
          "No products match these filters."
        )}
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <Link
            href={`/products/${p.id}`}
            className="flex h-full flex-col overflow-hidden rounded-lg border hover:bg-muted"
          >
            <span className="relative flex aspect-square items-center justify-center bg-muted">
              {p.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- photos come from /api/photos, which needs the session cookie; the image optimiser fetches without it
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "size-full object-cover",
                    p.archived && "opacity-50",
                  )}
                />
              ) : (
                <Package className="size-8 text-muted-foreground" aria-hidden />
              )}
              {p.archived && (
                <span className="absolute top-2 left-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium">
                  Archived
                </span>
              )}
            </span>
            <span className="flex flex-1 flex-col gap-0.5 p-2.5">
              <span className="text-sm font-medium wrap-anywhere">
                {p.name}
              </span>
              <span className="text-xs wrap-anywhere text-muted-foreground">
                {p.sku}
              </span>
              <span className="mt-auto pt-1 text-sm font-semibold">
                {formatMoney(p.price)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
