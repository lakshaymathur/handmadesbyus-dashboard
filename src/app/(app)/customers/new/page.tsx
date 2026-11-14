import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NewCustomerForm } from "@/features/customers/components/new-customer-form";

export const metadata: Metadata = { title: "Add a customer · HandMadesByUs" };

export default function NewCustomerPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Add a customer"
        back={{ href: "/customers", label: "Customers" }}
      />
      <NewCustomerForm />
    </section>
  );
}
