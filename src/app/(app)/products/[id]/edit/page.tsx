import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { ProductForm } from "@/features/products/components/product-form";
import { getProduct, getProductFormChoices } from "@/features/products/queries";
import { productToInput } from "@/features/products/to-input";

export const metadata: Metadata = { title: "Edit product · HandMadesByUs" };

export default function EditProductPage({
  params,
}: PageProps<"/products/[id]/edit">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <EditProduct params={params} />
      </Suspense>
    </section>
  );
}

async function EditProduct({
  params,
}: Pick<PageProps<"/products/[id]/edit">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [product, choices] = await Promise.all([
    getProduct(id),
    getProductFormChoices(),
  ]);
  if (!product) notFound();
  return (
    <>
      <PageHeader
        title={`Edit ${product.name}`}
        description="Orders already placed keep the price and cost they had."
        back={{ href: `/products/${id}`, label: product.name }}
      />
      <ProductForm
        productId={id}
        choices={choices}
        initial={productToInput(product)}
      />
    </>
  );
}
