import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** Page title with a link back to the Settings index. */
export function SettingsHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/settings"
        className="-ml-1 flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Settings
      </Link>
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Placeholder rows while a list loads; `withHeader` also stands in for the title. */
export function ListSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      {withHeader && (
        <div className="mb-4 flex flex-col gap-2">
          <div className="h-10 w-24 animate-pulse rounded bg-muted" />
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-5 w-full animate-pulse rounded bg-muted" />
        </div>
      )}
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}
