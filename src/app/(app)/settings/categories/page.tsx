import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoriesEditor } from "@/features/settings/components/categories-editor";
import {
  ListSkeleton,
  SettingsHeader,
} from "@/features/settings/components/settings-header";
import { getCategories } from "@/features/settings/queries";

export const metadata: Metadata = { title: "Categories · HandMadesByUs" };

export default function CategoriesPage() {
  return (
    <section className="flex flex-col gap-6">
      <SettingsHeader
        title="Categories"
        description="Kinds of product (Box, Pouch, …). Each has its own production stages: tap a category to edit them."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Categories />
      </Suspense>
    </section>
  );
}

async function Categories() {
  return <CategoriesEditor items={await getCategories()} />;
}
