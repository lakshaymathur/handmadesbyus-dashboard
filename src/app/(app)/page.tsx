import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home · HandMadesByUs" };

// Placeholder until M5 (order dashboard).
export default function HomePage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Home</h1>
      <p className="text-muted-foreground">
        Orders and production for today will show here (M5).
      </p>
    </section>
  );
}
