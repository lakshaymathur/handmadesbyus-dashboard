import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import {
  EMPTY_PRODUCT,
  ProductForm,
} from "@/features/products/components/product-form";
import { getProductFormChoices } from "@/features/products/queries";

export const metadata: Metadata = { title: "Add a product · HandMadesByUs" };

export default function NewProductPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Add a product"
        back={{ href: "/products", label: "Products" }}
      />
      <Suspense fallback={<ListSkeleton />}>
        <NewProduct />
      </Suspense>
    </section>
  );
}

async function NewProduct() {
  const choices = await getProductFormChoices();
  return <ProductForm initial={EMPTY_PRODUCT} choices={choices} />;
}
