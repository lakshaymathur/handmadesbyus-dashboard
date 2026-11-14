import { Copy, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/page-section";
import { buttonVariants } from "@/components/ui/button";
import { formatAddress, formatMobile } from "@/features/customers/format";
import { Thumbnail } from "@/features/orders/components/item-editor";
import { PriceBreakdown } from "@/features/orders/components/price-breakdown";
import { StageControls } from "@/features/orders/components/stage-controls";
import { StatusBadge } from "@/features/orders/components/status-badge";
import { StatusControls } from "@/features/orders/components/status-controls";
import {
  deadlineFlag,
  STATUS_LABELS,
  stageChangeProblem,
} from "@/features/orders/lifecycle";
import { lineTotal, unitPriceWithExtras } from "@/features/orders/pricing";
import { getOrder } from "@/features/orders/queries";
import { CHANNEL_LABELS, type Channel } from "@/features/orders/schema";
import { getGeneralSettings } from "@/features/settings/queries";
import { formatDateOnly, formatDateTime, todayIST } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Order · HandMadesByUs" };

// The id comes from the URL, so it's read inside <Suspense>.
export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <Order params={params} />
      </Suspense>
    </section>
  );
}

async function Order({ params }: Pick<PageProps<"/orders/[id]">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [order, settings] = await Promise.all([
    getOrder(id),
    getGeneralSettings(),
  ]);
  if (!order) notFound();
  const today = todayIST();
  const flag = deadlineFlag(
    order.status,
    order.promisedDate,
    today,
    settings.dueSoonDays,
  );

  return (
    <>
      <PageHeader
        title={order.code}
        back={{ href: "/orders", label: "Orders" }}
        action={
          <div className="flex gap-2">
            <Link
              href={`/orders/new?from=${order.id}`}
              className={buttonVariants({
                variant: "outline",
                className: "h-11",
              })}
              aria-label="Duplicate order"
            >
              <Copy aria-hidden />
              <span className="max-sm:sr-only">Duplicate</span>
            </Link>
            <Link
              href={`/orders/${order.id}/edit`}
              className={buttonVariants({
                variant: "outline",
                className: "h-11",
              })}
            >
              <Pencil aria-hidden />
              Edit
            </Link>
          </div>
        }
      />
      <div className="-mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        {order.priority === "urgent" && (
          <span className="text-sm font-semibold text-destructive">Urgent</span>
        )}
        {flag === "overdue" && (
          <span className="text-sm font-semibold text-destructive">
            Overdue
          </span>
        )}
        {flag === "due_soon" && (
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Due soon
          </span>
        )}
      </div>

      <PageSection title="Status">
        <StatusControls
          orderId={order.id}
          status={order.status}
          allFinished={order.items.every((i) => i.finished)}
          today={today}
        />
      </PageSection>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Customer</dt>
        <dd>
          <Link href={`/customers/${order.customer.id}`} className="underline">
            {order.customer.name}
          </Link>{" "}
          <span className="text-sm text-muted-foreground">
            {formatMobile(order.customer.mobile)}
          </span>
        </dd>
        <dt className="text-muted-foreground">Ordered</dt>
        <dd>
          {formatDateOnly(order.orderDate)}
          {order.channel && ` via ${CHANNEL_LABELS[order.channel as Channel]}`}
        </dd>
        <dt className="text-muted-foreground">Promised</dt>
        <dd>{formatDateOnly(order.promisedDate)}</dd>
        {order.deliveredDate && (
          <>
            <dt className="text-muted-foreground">Delivered</dt>
            <dd>{formatDateOnly(order.deliveredDate)}</dd>
          </>
        )}
        {order.status === "cancelled" && (
          <>
            <dt className="text-muted-foreground">Cancelled</dt>
            <dd className="wrap-anywhere">
              {order.cancelReason}
              {order.refundOwed && " · Refund owed"}
            </dd>
          </>
        )}
      </dl>

      <PageSection title="Items">
        <ul className="flex flex-col divide-y rounded-lg border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 p-3">
              <Thumbnail url={item.thumbnailUrl} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium wrap-anywhere">
                  {item.productName}
                </span>
                <span className="text-sm text-muted-foreground">
                  {item.quantity} × {formatMoney(unitPriceWithExtras(item))}
                </span>
                {item.customisations.length > 0 && (
                  <span className="text-sm wrap-anywhere text-muted-foreground">
                    {item.customisations
                      .map((c) =>
                        c.choiceName
                          ? `${c.name} (${c.choiceName})`
                          : c.text
                            ? `${c.name} “${c.text}”`
                            : c.name,
                      )
                      .join(", ")}
                  </span>
                )}
                {item.notes && (
                  <span className="text-sm wrap-anywhere">{item.notes}</span>
                )}
                <span className="text-sm">
                  Stage: <span className="font-medium">{item.stage.name}</span>
                </span>
              </div>
              <span className="font-medium">
                {formatMoney(lineTotal(item))}
              </span>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection title="Production">
        <StageControls
          orderId={order.id}
          items={order.items}
          lockedReason={stageChangeProblem(order.status)}
        />
      </PageSection>

      <PageSection title="Price">
        <PriceBreakdown totals={order.totals}>
          <dt className="text-muted-foreground">Paid / balance due</dt>
          <dd className="text-right text-muted-foreground">
            With payments (M6)
          </dd>
        </PriceBreakdown>
      </PageSection>

      <PageSection title="Delivery address">
        <p className="wrap-anywhere">{formatAddress(order.address)}</p>
      </PageSection>

      {order.notes && (
        <PageSection title="Notes">
          <p className="wrap-anywhere whitespace-pre-line">{order.notes}</p>
        </PageSection>
      )}

      <PageSection title="History">
        <ol className="flex flex-col gap-3">
          {order.history.map((h) => (
            <li key={h.id} className="flex flex-col text-sm">
              <span>
                {h.toStatus
                  ? h.fromStatus
                    ? `${STATUS_LABELS[h.fromStatus]} → ${STATUS_LABELS[h.toStatus]}`
                    : `Order created (${STATUS_LABELS[h.toStatus].toLowerCase()})`
                  : `${h.itemName ?? "Removed item"}: ${h.fromStage ?? "?"} → ${h.toStage ?? "?"}`}
              </span>
              {h.note && (
                <span className="wrap-anywhere text-muted-foreground">
                  {h.note}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDateTime(h.at)} · {h.by}
              </span>
            </li>
          ))}
        </ol>
      </PageSection>
    </>
  );
}
