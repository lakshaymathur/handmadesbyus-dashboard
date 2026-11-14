import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import {
  EMPTY_PRODUCT,
  ProductForm,
} from "@/features/products/components/product-form";
import { getProduct, getProductFormChoices } from "@/features/products/queries";
import { productToInput } from "@/features/products/to-input";

export const metadata: Metadata = { title: "Add a product · HandMadesByUs" };

// ?from=<product id> starts from a copy of that product (§3.4 "Duplicate"), e.g. to add
// a colour variant: everything but the product ID and photos is filled in.
export default function NewProductPage({
  searchParams,
}: PageProps<"/products/new">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <NewProduct searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function NewProduct({
  searchParams,
}: Pick<PageProps<"/products/new">, "searchParams">) {
  const { from } = await searchParams;
  const fromId =
    typeof from === "string" && z.uuid().safeParse(from).success ? from : null;
  const [choices, original] = await Promise.all([
    getProductFormChoices(),
    fromId ? getProduct(fromId) : null,
  ]);
  return (
    <>
      <PageHeader
        title={original ? "Duplicate a product" : "Add a product"}
        description={
          original
            ? `A copy of “${original.name}”. Give it its own product ID, change what's different, then add it. Photos aren't copied.`
            : undefined
        }
        back={
          original
            ? { href: `/products/${original.id}`, label: original.name }
            : { href: "/products", label: "Products" }
        }
      />
      <ProductForm
        initial={
          original
            ? {
                ...productToInput(original),
                sku: "",
                // A new product only gets options its category offers today.
                optionIds: original.options
                  .map((o) => o.id)
                  .filter((id) =>
                    choices.options.some(
                      (o) =>
                        o.id === id &&
                        o.categoryIds.includes(original.categoryId),
                    ),
                  ),
              }
            : EMPTY_PRODUCT
        }
        choices={choices}
      />
    </>
  );
}
