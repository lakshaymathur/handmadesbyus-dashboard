import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderTotals } from "../pricing";

/**
 * An order's price (§3.2): items, customisations, discount, shipping and total. Used by
 * the order form (live) and the order page. `children` adds rows after the total (e.g.
 * paid and balance due); `warning` explains a problem with the numbers.
 */
export function PriceBreakdown({
  totals,
  warning,
  className,
  children,
}: {
  totals: OrderTotals;
  warning?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
        <dt>Items</dt>
        <dd className="text-right">
          {formatMoney(totals.subtotal - totals.customisations)}
        </dd>
        <dt>Customisations</dt>
        <dd className="text-right">{formatMoney(totals.customisations)}</dd>
        {totals.discount > 0 && (
          <>
            <dt>Discount</dt>
            <dd className="text-right">−{formatMoney(totals.discount)}</dd>
          </>
        )}
        <dt>Shipping</dt>
        <dd className="text-right">{formatMoney(totals.shippingCharged)}</dd>
        <dt className="border-t pt-1 font-semibold">Total</dt>
        <dd className="border-t pt-1 text-right font-semibold">
          {formatMoney(totals.total)}
        </dd>
        {children}
      </dl>
      {warning && (
        <p role="alert" className="text-sm text-destructive">
          {warning}
        </p>
      )}
    </div>
  );
}
