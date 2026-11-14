import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { AddressForm } from "@/features/customers/components/address-form";
import { getCustomer } from "@/features/customers/queries";

export const metadata: Metadata = { title: "Add an address · HandMadesByUs" };

export default function NewAddressPage({
  params,
}: PageProps<"/customers/[id]/addresses/new">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <NewAddress params={params} />
      </Suspense>
    </section>
  );
}

async function NewAddress({
  params,
}: Pick<PageProps<"/customers/[id]/addresses/new">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  return (
    <>
      <PageHeader
        title="Add an address"
        description={`For ${customer.name} (${customer.code})`}
        back={{ href: `/customers/${id}`, label: customer.name }}
      />
      <AddressForm mode="add" customerId={id} />
    </>
  );
}
