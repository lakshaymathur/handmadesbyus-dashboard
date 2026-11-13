import type { Metadata } from "next";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const metadata: Metadata = { title: "More · HandMadesByUs" };

export default function MorePage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">More</h1>
      <p className="text-muted-foreground">
        Shipments, payments, expenses, financials and settings will be listed
        here.
      </p>
      <div className="max-w-xs">
        <SignOutButton />
      </div>
    </section>
  );
}
