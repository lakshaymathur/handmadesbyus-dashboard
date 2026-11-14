import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CustomerSearch } from "@/features/customers/components/customer-search";
import { formatMobile } from "@/features/customers/format";
import { searchCustomers } from "@/features/customers/queries";

export const metadata: Metadata = { title: "Customers · HandMadesByUs" };

export default function CustomersPage({
  searchParams,
}: PageProps<"/customers">) {
  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Customers"
        action={
          <Link
            href="/customers/new"
            className={buttonVariants({ className: "h-11" })}
          >
            <Plus aria-hidden />
            Add
          </Link>
        }
      />
      {/* The query comes from the URL, so it's read inside <Suspense>. */}
      <Suspense
        fallback={
          <>
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
            <ListSkeleton />
          </>
        }
      >
        <SearchAndResults searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function SearchAndResults({
  searchParams,
}: Pick<PageProps<"/customers">, "searchParams">) {
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").slice(0, 100);
  return (
    <>
      <CustomerSearch initial={query} />
      <Suspense fallback={<ListSkeleton />}>
        <Results query={query} />
      </Suspense>
    </>
  );
}

async function Results({ query }: { query: string }) {
  const { customers, more } = await searchCustomers(query);
  if (customers.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground">
        {query ? (
          <>
            No customer matches “{query}”.{" "}
            <Link href="/customers/new" className="underline">
              Add a customer
            </Link>
          </>
        ) : (
          "No customers yet."
        )}
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y rounded-lg border">
        {customers.map((c) => (
          <li key={c.id}>
            <Link
              href={`/customers/${c.id}`}
              className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium wrap-anywhere">{c.name}</span>
                <span className="text-sm text-muted-foreground">
                  {c.code} · {formatMobile(c.mobile)}
                  {c.city && ` · ${c.city}`}
                </span>
                {c.instagramHandle && (
                  <span className="text-sm wrap-anywhere text-muted-foreground">
                    @{c.instagramHandle}
                  </span>
                )}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
      {more && (
        <p className="text-center text-sm text-muted-foreground">
          Showing the {customers.length} newest. Search to find others.
        </p>
      )}
    </>
  );
}
