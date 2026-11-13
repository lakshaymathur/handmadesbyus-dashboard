import type { Metadata } from "next";

export const metadata: Metadata = { title: "Orders · HandMadesByUs" };

// Placeholder until M4 (orders).
export default function OrdersPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Orders</h1>
      <p className="text-muted-foreground">Orders arrive in M4.</p>
    </section>
  );
}
