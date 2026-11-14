import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { getCustomer } from "@/features/customers/queries";
import { OrderForm } from "@/features/orders/components/order-form";
import { OPEN_STATUSES } from "@/features/orders/lifecycle";
import { getOrder } from "@/features/orders/queries";
import { orderToInput } from "@/features/orders/to-input";
import { getOrderCatalogue } from "@/features/products/queries";

export const metadata: Metadata = { title: "Edit order · HandMadesByUs" };

export default function EditOrderPage({
  params,
}: PageProps<"/orders/[id]/edit">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <EditOrder params={params} />
      </Suspense>
    </section>
  );
}

async function EditOrder({
  params,
}: Pick<PageProps<"/orders/[id]/edit">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const [catalogue, customer] = await Promise.all([
    // Products already on the order stay available even if archived since.
    getOrderCatalogue(order.items.map((i) => i.productId)),
    getCustomer(order.customer.id),
  ]);
  const closed = !OPEN_STATUSES.includes(order.status);
  return (
    <>
      <PageHeader
        title={`Edit ${order.code}`}
        description={[
          "Items already on the order keep the prices and costs they were added with.",
          closed
            ? "This order is closed: changing its total changes revenue already counted."
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        back={{ href: `/orders/${order.id}`, label: order.code }}
      />
      <OrderForm
        catalogue={catalogue}
        initial={orderToInput(order)}
        initialCustomer={customer}
        orderId={order.id}
        savedItems={order.items}
      />
    </>
  );
}
