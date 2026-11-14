import { cn } from "@/lib/utils";
import { STATUS_LABELS, type OrderStatus } from "../lifecycle";

const TONES: Record<OrderStatus, string> = {
  in_production:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  ready_for_pickup: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  docket_raised: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  in_transit:
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  delivered:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  on_hold: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
  returned: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

/** An order's status as a small coloured label. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        TONES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
