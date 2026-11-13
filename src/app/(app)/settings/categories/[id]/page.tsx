import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { StagesEditor } from "@/features/settings/components/stages-editor";
import { getCategoryWithStages } from "@/features/settings/queries";

export const metadata: Metadata = {
  title: "Production stages · HandMadesByUs",
};

// The id comes from the URL, so it's read inside <Suspense> (see settings/lists/[list]).
export default function CategoryStagesPage({
  params,
}: PageProps<"/settings/categories/[id]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <Stages params={params} />
      </Suspense>
    </section>
  );
}

async function Stages({
  params,
}: Pick<PageProps<"/settings/categories/[id]">, "params">) {
  const { id } = await params;
  // Not a UUID: no such category (and don't send Postgres a malformed uuid).
  if (!z.uuid().safeParse(id).success) notFound();
  const category = await getCategoryWithStages(id);
  if (!category) notFound();
  return (
    <>
      <SettingsHeader
        title={`${category.name}: production stages`}
        description="Every item in this category moves through these stages in order. When all of an order's items reach their last stage, the order is ready for pickup."
        back={{ href: "/settings/categories", label: "Categories" }}
      />
      <StagesEditor categoryId={category.id} items={category.stages} />
    </>
  );
}
