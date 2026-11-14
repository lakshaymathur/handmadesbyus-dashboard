import { ChevronRight, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/features/orders/components/status-badge";
import { getOrders, ORDER_LIST_LIMIT } from "@/features/orders/queries";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Orders · HandMadesByUs" };

// A plain list until the order dashboard (M5).
export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Orders"
        action={
          <Link
            href="/orders/new"
            className={buttonVariants({ className: "h-11" })}
          >
            <Plus aria-hidden />
            New order
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton />}>
        <OrderList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function OrderList({
  searchParams,
}: Pick<PageProps<"/orders">, "searchParams">) {
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").slice(0, 100);
  const orders = await getOrders(query);
  return (
    <>
      <form role="search" action="/orders" className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Order code, customer name or mobile"
          aria-label="Search orders"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 pl-9"
        />
      </form>
      {orders.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">
          {query ? `No order matches “${query}”.` : "No orders yet."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="flex min-h-16 items-center gap-3 px-3 py-2 hover:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.code}</span>
                    <StatusBadge status={o.status} />
                    {o.priority === "urgent" && (
                      <span className="text-xs font-semibold text-destructive">
                        Urgent
                      </span>
                    )}
                  </span>
                  <span className="text-sm wrap-anywhere text-muted-foreground">
                    {o.customerName} · promised {formatDateOnly(o.promisedDate)}
                  </span>
                </span>
                <span className="text-sm font-medium">
                  {formatMoney(o.total)}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {orders.length === ORDER_LIST_LIMIT && (
        <p className="text-center text-sm text-muted-foreground">
          Showing the {ORDER_LIST_LIMIT} newest. Search to find others.
        </p>
      )}
    </>
  );
}
