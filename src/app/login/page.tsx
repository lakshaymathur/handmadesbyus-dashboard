import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in · HandMadesByUs" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">HandMadesByUs</h1>
        <p className="text-muted-foreground">Sign in to the dashboard.</p>
      </div>
      {/* The form reads ?next= from the URL, which is only known at request time. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </main>
  );
}
