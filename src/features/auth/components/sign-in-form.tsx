"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { ACCOUNT_DEACTIVATED } from "@/lib/auth/errors";
import { toFormErrors } from "@/lib/validation";
import { safeNextPath } from "../safe-next";
import { signInSchema } from "../schema";

type FieldErrors = { username?: string[]; password?: string[] };

function signInErrorMessage(status: number, code?: string): string {
  if (code === ACCOUNT_DEACTIVATED) {
    return "This account has been deactivated. Ask someone with access to reactivate it.";
  }
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  // Origin check: the app was opened at an address not in BETTER_AUTH_URL/TRUSTED_ORIGINS.
  if (status === 403) return "Signing in isn't allowed from this address.";
  if (status === 0 || status >= 500)
    return "Couldn't reach the server. Try again.";
  // 401 wrong password; 400/422 invalid username format.
  return "Wrong username or password.";
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      username: form.get("username"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setFieldErrors(toFormErrors(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors({});
    setPending(true);
    const { error: signInError } = await authClient.signIn.username(
      parsed.data,
    );
    if (signInError) {
      setPending(false);
      setError(signInErrorMessage(signInError.status, signInError.code));
      return;
    }
    router.replace(safeNextPath(searchParams.get("next")));
    router.refresh();
  }

  return (
    // method="post": if JavaScript hasn't loaded (slow network, script error), the browser
    // submits the form itself. With the default GET that would put the password in the URL,
    // browser history and server logs.
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="h-11"
          aria-invalid={fieldErrors.username ? true : undefined}
          aria-describedby={fieldErrors.username ? "username-error" : undefined}
        />
        {fieldErrors.username && (
          <p id="username-error" className="text-sm text-destructive">
            {fieldErrors.username[0]}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
        />
        {fieldErrors.password && (
          <p id="password-error" className="text-sm text-destructive">
            {fieldErrors.password[0]}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
