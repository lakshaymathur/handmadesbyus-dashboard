import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ChoicesEditor } from "@/features/settings/components/choices-editor";
import { OptionForm } from "@/features/settings/components/option-form";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import {
  getCategoryChoices,
  getCustomisationOption,
} from "@/features/settings/queries";
import { paiseToInput } from "@/lib/money";

export const metadata: Metadata = {
  title: "Customisation option · HandMadesByUs",
};

const back = {
  href: "/settings/customisations",
  label: "Customisation options",
};

// The id comes from the URL, so it's read inside <Suspense> (see settings/lists/[list]).
export default function OptionPage({
  params,
}: PageProps<"/settings/customisations/[id]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <Option params={params} />
      </Suspense>
    </section>
  );
}

async function Option({
  params,
}: Pick<PageProps<"/settings/customisations/[id]">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [option, categories] = await Promise.all([
    getCustomisationOption(id),
    getCategoryChoices(),
  ]);
  if (!option) notFound();
  return (
    <>
      <SettingsHeader
        title={option.name}
        description={
          option.active
            ? undefined
            : "Inactive: kept on old orders, but can't be picked for new ones."
        }
        back={back}
      />
      <OptionForm
        optionId={option.id}
        categories={categories}
        initial={{
          name: option.name,
          inputType: option.inputType,
          maxLength: String(option.maxLength ?? 30),
          extraPrice: paiseToInput(option.extraPrice),
          extraCost: paiseToInput(option.extraCost),
          categoryIds: option.categoryIds,
        }}
      />
      {option.inputType === "choice" && (
        <div className="flex flex-col gap-3 border-t pt-6">
          <h2 className="font-heading text-lg font-semibold">Choices</h2>
          <p className="text-muted-foreground">
            What the customer picks from, in this order.
          </p>
          <ChoicesEditor optionId={option.id} items={option.choices} />
        </div>
      )}
    </>
  );
}
