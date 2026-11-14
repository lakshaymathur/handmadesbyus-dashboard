import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ListSkeleton, PageHeader } from "@/components/page-header";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { getCustomer } from "@/features/customers/queries";

export const metadata: Metadata = { title: "Edit customer · HandMadesByUs" };

export default function EditCustomerPage({
  params,
}: PageProps<"/customers/[id]/edit">) {
  return (
    <section className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton withHeader />}>
        <EditCustomer params={params} />
      </Suspense>
    </section>
  );
}

async function EditCustomer({
  params,
}: Pick<PageProps<"/customers/[id]/edit">, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  return (
    <>
      <PageHeader
        title={`Edit ${customer.name}`}
        description={customer.code}
        back={{ href: `/customers/${id}`, label: customer.name }}
      />
      <CustomerForm
        customerId={id}
        initial={{
          mobile: customer.mobile,
          instagramHandle: customer.instagramHandle ?? "",
          firstName: customer.firstName,
          lastName: customer.lastName ?? "",
          // Imported customers may have no source yet; the form asks for one.
          source: customer.source ?? "other",
          altMobile: customer.altMobile ?? "",
          email: customer.email ?? "",
          notes: customer.notes ?? "",
        }}
      />
    </>
  );
}
