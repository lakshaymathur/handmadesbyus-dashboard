import { ChevronRight, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
      <Link
        href="/settings"
        className="flex h-12 items-center gap-3 rounded-lg border px-3 hover:bg-muted"
      >
        <Settings className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1">Settings</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      <div className="max-w-xs">
        <SignOutButton />
      </div>
    </section>
  );
}
