import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { ProductForm } from "@/features/products/components/product-form";
import { getProduct, getProductFormChoices } from "@/features/products/queries";
import { paiseToInput } from "@/lib/money";
import { mmToCmInput } from "@/lib/units";

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

const cm = (mm: number | null) => (mm === null ? "" : mmToCmInput(mm));

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
        initial={{
          sku: product.sku,
          name: product.name,
          categoryId: product.categoryId,
          typeId: product.typeId ?? "",
          colourId: product.colourId ?? "",
          designId: product.designId ?? "",
          length: cm(product.lengthMm),
          width: cm(product.widthMm),
          height: cm(product.heightMm),
          weight: product.weightG === null ? "" : String(product.weightG),
          price: paiseToInput(product.price),
          cost: paiseToInput(product.cost),
          optionIds: product.options.map((o) => o.id),
        }}
      />
    </>
  );
}
