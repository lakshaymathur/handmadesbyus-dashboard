import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customers · HandMadesByUs" };

// Placeholder until M2 (customers).
export default function CustomersPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Customers</h1>
      <p className="text-muted-foreground">Customers arrive in M2.</p>
    </section>
  );
}
