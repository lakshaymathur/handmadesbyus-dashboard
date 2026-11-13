"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      className="h-11 w-full justify-start gap-2"
      onClick={signOut}
      disabled={pending}
    >
      <LogOut aria-hidden />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
