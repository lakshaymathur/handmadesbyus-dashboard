import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { CustomisationOptionsEditor } from "@/features/settings/components/customisation-options-editor";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { getCustomisationOptions } from "@/features/settings/queries";

export const metadata: Metadata = {
  title: "Customisation options · HandMadesByUs",
};

export default function CustomisationsPage() {
  return (
    <section className="flex flex-col gap-6">
      <SettingsHeader
        title="Customisation options"
        description="Add-ons a customer can choose for an item (latkan, sticker, …), each with an extra charge. Tap one to edit it."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Options />
      </Suspense>
      <Link
        href="/settings/customisations/new"
        className={buttonVariants({ className: "h-11" })}
      >
        <Plus aria-hidden />
        Add an option
      </Link>
    </section>
  );
}

async function Options() {
  return <CustomisationOptionsEditor items={await getCustomisationOptions()} />;
}
