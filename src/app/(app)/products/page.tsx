import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getProducts } from "@/features/products/queries";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products · HandMadesByUs" };

export default function ProductsPage() {
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
      <Suspense fallback={<ListSkeleton />}>
        <ProductList />
      </Suspense>
    </section>
  );
}

// A plain list for now; the photo grid and filters come with photos (M3 steps 2–3).
async function ProductList() {
  const products = await getProducts();
  if (products.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground">
        No products yet.{" "}
        <Link href="/products/new" className="underline">
          Add the first one
        </Link>
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {products.map((p) => (
        <li key={p.id}>
          <Link
            href={`/products/${p.id}`}
            className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "font-medium wrap-anywhere",
                  p.archived && "text-muted-foreground",
                )}
              >
                {p.name}
              </span>
              <span className="text-sm wrap-anywhere text-muted-foreground">
                {[p.sku, p.category, p.colour].filter(Boolean).join(" · ")}
                {p.archived && " · Archived"}
              </span>
            </span>
            <span className="text-sm font-medium">{formatMoney(p.price)}</span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
