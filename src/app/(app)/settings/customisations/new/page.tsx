import type { Metadata } from "next";
import { Suspense } from "react";
import { OptionForm } from "@/features/settings/components/option-form";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { getCategoryChoices } from "@/features/settings/queries";

export const metadata: Metadata = {
  title: "New customisation option · HandMadesByUs",
};

const back = {
  href: "/settings/customisations",
  label: "Customisation options",
};

export default function NewOptionPage() {
  return (
    <section className="flex flex-col gap-6">
      <SettingsHeader title="New customisation option" back={back} />
      <Suspense fallback={<ListSkeleton />}>
        <NewOptionForm />
      </Suspense>
    </section>
  );
}

async function NewOptionForm() {
  return (
    <OptionForm
      categories={await getCategoryChoices()}
      initial={{
        name: "",
        inputType: "none",
        maxLength: "30",
        extraPrice: "0",
        extraCost: "0",
        categoryIds: [],
      }}
    />
  );
}
