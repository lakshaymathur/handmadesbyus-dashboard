import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { getCustomer } from "@/features/customers/queries";
import { OrderForm } from "@/features/orders/components/order-form";
import { getOrder } from "@/features/orders/queries";
import type { OrderInput } from "@/features/orders/schema";
import { duplicateToInput } from "@/features/orders/to-input";
import { getOrderCatalogue } from "@/features/products/queries";
import { todayIST } from "@/lib/dates";

export const metadata: Metadata = { title: "New order · HandMadesByUs" };

// ?from=<order id> starts from a copy of that order (§3.2 "Duplicate order").
export default function NewOrderPage({
  searchParams,
}: PageProps<"/orders/new">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <NewOrder searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function NewOrder({
  searchParams,
}: Pick<PageProps<"/orders/new">, "searchParams">) {
  const { from, customer: forCustomer } = await searchParams;
  const asId = (value: unknown) =>
    typeof value === "string" && z.uuid().safeParse(value).success
      ? value
      : null;
  const fromId = asId(from);
  const customerId = asId(forCustomer);
  const [catalogue, original, chosenCustomer] = await Promise.all([
    getOrderCatalogue(),
    fromId ? getOrder(fromId) : null,
    // ?customer=<id>: "New order" from a customer's page.
    !fromId && customerId ? getCustomer(customerId) : null,
  ]);
  // Today in India, decided on the server (the phone's clock and zone may differ).
  const today = todayIST();

  if (original) {
    const [customer, { input, skipped }] = await Promise.all([
      getCustomer(original.customer.id),
      duplicateToInput(original, catalogue, today),
    ]);
    return (
      <>
        <PageHeader
          title="Duplicate order"
          description={`A copy of ${original.code} at today's prices. Set the promised date, check the items, then create it.${
            skipped.length > 0
              ? ` Not copied (no longer offered): ${skipped.join(", ")}.`
              : ""
          }`}
          back={{ href: `/orders/${original.id}`, label: original.code }}
        />
        <OrderForm
          catalogue={catalogue}
          initial={input}
          initialCustomer={customer}
        />
      </>
    );
  }

  const address = chosenCustomer?.addresses[0]; // the default comes first
  const initial: OrderInput = {
    customerId: chosenCustomer?.id ?? "",
    orderDate: today,
    promisedDate: "",
    priority: "normal",
    channel: "instagram",
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    landmark: address?.landmark ?? "",
    city: address?.city ?? "",
    state: (address?.state ?? "") as OrderInput["state"],
    pin: address?.pin ?? "",
    discountType: "none",
    discountValue: "",
    shippingCharged: "0",
    notes: "",
    items: [],
  };
  return (
    <>
      <PageHeader
        title="New order"
        back={{ href: "/orders", label: "Orders" }}
      />
      <OrderForm
        catalogue={catalogue}
        initial={initial}
        initialCustomer={chosenCustomer}
      />
    </>
  );
}
