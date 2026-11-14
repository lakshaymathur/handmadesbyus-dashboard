import { Copy, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/page-section";
import { buttonVariants } from "@/components/ui/button";
import { ArchiveButton } from "@/features/products/components/archive-button";
import { DeleteProductButton } from "@/features/products/components/delete-product-button";
import { PhotoManager } from "@/features/products/components/photo-manager";
import { getProduct } from "@/features/products/queries";
import { margin } from "@/features/products/schema";
import { formatMoney } from "@/lib/money";
import { formatSize, formatWeight } from "@/lib/units";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Product · HandMadesByUs" };

// The id comes from the URL, so it's read inside <Suspense>.
export default function ProductPage({ params }: PageProps<"/products/[id]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <Product params={params} />
      </Suspense>
    </section>
  );
}

function Facts({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="wrap-anywhere">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

async function Product({
  params,
}: Pick<PageProps<"/products/[id]">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
  const m = margin(product.price, product.cost);

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.sku} · ${product.category}${product.archived ? " · Archived" : ""}`}
        back={{ href: "/products", label: "Products" }}
        action={
          <Link
            href={`/products/${product.id}/edit`}
            className={buttonVariants({
              variant: "outline",
              className: "h-11",
            })}
          >
            <Pencil aria-hidden />
            Edit
          </Link>
        }
      />

      <Facts
        rows={[
          ["Price", formatMoney(product.price)],
          ["Cost", formatMoney(product.cost)],
          [
            "Margin",
            `${formatMoney(m.paise)}${m.percent === null ? "" : ` (${m.percent}%)`}`,
          ],
        ]}
      />
      {m.paise < 0 && (
        <p className={cn("text-sm text-destructive")}>
          This product costs more to make than it sells for.
        </p>
      )}

      <PageSection title="Photos">
        <PhotoManager
          productId={product.id}
          productName={product.name}
          photos={product.photos}
        />
      </PageSection>

      <PageSection title="Details">
        <Facts
          rows={[
            ["Type", product.type],
            ["Colour", product.colour],
            ["Design", product.design],
            [
              "Size (L × W × H)",
              formatSize(product.lengthMm, product.widthMm, product.heightMm),
            ],
            [
              "Weight",
              product.weightG === null ? null : formatWeight(product.weightG),
            ],
          ]}
        />
      </PageSection>

      <PageSection title="Customisations offered">
        {product.options.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <p>{product.options.map((o) => o.name).join(", ")}</p>
        )}
      </PageSection>

      <PageSection title={product.archived ? "Archived" : "Archive"}>
        <p className="text-muted-foreground">
          {product.archived
            ? "Hidden from new orders. Past orders keep it."
            : "Hide it from new orders. Past orders keep it, with the price they were placed at."}
        </p>
        <ArchiveButton productId={product.id} archived={product.archived} />
      </PageSection>

      <PageSection title="Duplicate">
        <p className="text-muted-foreground">
          Start a new product from this one, e.g. the same box in another
          colour.
        </p>
        <Link
          href={`/products/new?from=${product.id}`}
          className={buttonVariants({
            variant: "outline",
            className: "h-11 sm:w-fit",
          })}
        >
          <Copy aria-hidden />
          Duplicate
        </Link>
      </PageSection>

      {!product.usedInOrders && (
        <PageSection title="Delete">
          <p className="text-muted-foreground">
            Only for products that have never been ordered. Once a product is on
            an order, archive it instead.
          </p>
          <DeleteProductButton
            productId={product.id}
            productName={product.name}
          />
        </PageSection>
      )}
    </>
  );
}
