import type { Metadata } from "next";

export const metadata: Metadata = { title: "Products · HandMadesByUs" };

// Placeholder until M3 (products).
export default function ProductsPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Products</h1>
      <p className="text-muted-foreground">Products arrive in M3.</p>
    </section>
  );
}
