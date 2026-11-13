import type { Metadata } from "next";
import { Suspense } from "react";
import { GeneralSettingsForm } from "@/features/settings/components/general-settings-form";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { getGeneralSettings } from "@/features/settings/queries";

export const metadata: Metadata = { title: "General · HandMadesByUs" };

export default function GeneralSettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <SettingsHeader title="General" />
      <Suspense fallback={<ListSkeleton />}>
        <Form />
      </Suspense>
    </section>
  );
}

async function Form() {
  return <GeneralSettingsForm initial={await getGeneralSettings()} />;
}
