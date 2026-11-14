import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { OrderForm } from "@/features/orders/components/order-form";
import type { OrderInput } from "@/features/orders/schema";
import { getOrderCatalogue } from "@/features/products/queries";
import { todayIST } from "@/lib/dates";

export const metadata: Metadata = { title: "New order · HandMadesByUs" };

export default function NewOrderPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="New order"
        back={{ href: "/orders", label: "Orders" }}
      />
      <Suspense fallback={<ListSkeleton />}>
        <NewOrder />
      </Suspense>
    </section>
  );
}

async function NewOrder() {
  const catalogue = await getOrderCatalogue();
  const initial: OrderInput = {
    customerId: "",
    // Today in India, decided on the server (the phone's clock and zone may differ).
    orderDate: todayIST(),
    promisedDate: "",
    priority: "normal",
    channel: "instagram",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "" as OrderInput["state"],
    pin: "",
    discountType: "none",
    discountValue: "",
    shippingCharged: "0",
    notes: "",
    items: [],
  };
  return (
    <OrderForm catalogue={catalogue} initial={initial} initialCustomer={null} />
  );
}
