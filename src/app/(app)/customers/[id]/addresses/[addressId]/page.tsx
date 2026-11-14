import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { AddressForm } from "@/features/customers/components/address-form";
import { getAddress } from "@/features/customers/queries";
import type { AddressInput } from "@/features/customers/schema";

export const metadata: Metadata = { title: "Edit address · HandMadesByUs" };

export default function EditAddressPage({
  params,
}: PageProps<"/customers/[id]/addresses/[addressId]">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <EditAddress params={params} />
      </Suspense>
    </section>
  );
}

async function EditAddress({
  params,
}: Pick<PageProps<"/customers/[id]/addresses/[addressId]">, "params">) {
  const { id, addressId } = await params;
  if (!z.uuid().safeParse(addressId).success) notFound();
  const address = await getAddress(addressId);
  if (!address || address.customerId !== id) notFound();
  return (
    <>
      <PageHeader
        title="Edit address"
        description={`${address.customerName}${address.isDefault ? " · Default address" : ""}. Past orders keep the address they were placed with.`}
        back={{ href: `/customers/${id}`, label: address.customerName }}
      />
      <AddressForm
        mode="edit"
        addressId={addressId}
        initial={{
          line1: address.line1,
          line2: address.line2 ?? "",
          landmark: address.landmark ?? "",
          city: address.city,
          // Stored text; one not in the list (e.g. imported) must be chosen again.
          state: address.state as AddressInput["state"],
          pin: address.pin,
        }}
      />
    </>
  );
}
