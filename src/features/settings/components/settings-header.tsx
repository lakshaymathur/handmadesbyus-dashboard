import { ListSkeleton, PageHeader } from "@/components/page-header";

export { ListSkeleton };

/** A Settings page title, linking back to the Settings index unless `back` says otherwise. */
export function SettingsHeader({
  back = { href: "/settings", label: "Settings" },
  ...props
}: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
}) {
  return <PageHeader back={back} {...props} />;
}
