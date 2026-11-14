"use client";

import { useId, useState } from "react";
import { FormField, FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateThenRun } from "@/lib/client-action";
import { useActionButton } from "@/lib/use-action-button";
import { useActionForm } from "@/lib/use-action-form";
import {
  changeOwnPassword,
  createUser,
  renameUser,
  resetUserPassword,
  setUserActive,
} from "../actions";
import {
  changeOwnPasswordSchema,
  createUserSchema,
  renameUserSchema,
  resetPasswordSchema,
  setUserActiveSchema,
} from "../schema";

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" className="h-11 sm:w-fit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** A password input with a Show/Hide toggle (new passwords are typed, then told to people). */
function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  invalid: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        className="h-11 flex-1"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={`${id}-note`}
      />
      <Button
        type="button"
        variant="outline"
        className="h-11 w-20"
        onClick={() => setShown(!shown)}
        aria-pressed={shown}
      >
        {shown ? "Hide" : "Show"}
      </Button>
    </div>
  );
}

export function NewUserForm() {
  const id = useId();
  const form = useActionForm(
    { name: "", username: "", password: "" },
    (values) => validateThenRun(createUserSchema, values, createUser),
  );
  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-5"
    >
      <FormField id={`${id}-name`} label="Name" error={form.error("name")}>
        <Input
          id={`${id}-name`}
          value={form.values.name}
          onChange={(e) => form.set("name", e.target.value)}
          autoComplete="off"
          className="h-11"
          aria-invalid={form.error("name") ? true : undefined}
          aria-describedby={`${id}-name-note`}
        />
      </FormField>
      <FormField
        id={`${id}-username`}
        label="Username"
        error={form.error("username")}
        help="3–30 letters, digits, _ or . — used to sign in, and can't be changed later."
      >
        <Input
          id={`${id}-username`}
          value={form.values.username}
          onChange={(e) => form.set("username", e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11"
          aria-invalid={form.error("username") ? true : undefined}
          aria-describedby={`${id}-username-note`}
        />
      </FormField>
      <FormField
        id={`${id}-password`}
        label="Temporary password"
        error={form.error("password")}
        help="At least 10 characters. Share it privately; they can change it after signing in."
      >
        <PasswordInput
          id={`${id}-password`}
          value={form.values.password}
          onChange={(v) => form.set("password", v)}
          autoComplete="new-password"
          invalid={!!form.error("password")}
        />
      </FormField>
      <FormMessage message={form.message} />
      <SubmitButton pending={form.pending} label="Add user" />
    </form>
  );
}

export function RenameUserForm({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const id = useId();
  const form = useActionForm(
    { name },
    (values) =>
      validateThenRun(renameUserSchema, { id: userId, ...values }, renameUser),
    { success: "Saved." },
  );
  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-4"
    >
      <FormField id={`${id}-name`} label="Name" error={form.error("name")}>
        <Input
          id={`${id}-name`}
          value={form.values.name}
          onChange={(e) => form.set("name", e.target.value)}
          autoComplete="off"
          className="h-11"
          aria-invalid={form.error("name") ? true : undefined}
          aria-describedby={`${id}-name-note`}
        />
      </FormField>
      <FormMessage message={form.message} />
      <SubmitButton pending={form.pending} label="Save name" />
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const id = useId();
  const form = useActionForm(
    { password: "" },
    (values) =>
      validateThenRun(
        resetPasswordSchema,
        { id: userId, ...values },
        resetUserPassword,
      ),
    {
      success: "Password reset. They've been signed out everywhere.",
      resetOnSuccess: true,
    },
  );
  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-4"
    >
      <FormField
        id={`${id}-password`}
        label="New password"
        error={form.error("password")}
        help="At least 10 characters. They'll be signed out on every device."
      >
        <PasswordInput
          id={`${id}-password`}
          value={form.values.password}
          onChange={(v) => form.set("password", v)}
          autoComplete="new-password"
          invalid={!!form.error("password")}
        />
      </FormField>
      <FormMessage message={form.message} />
      <SubmitButton pending={form.pending} label="Reset password" />
    </form>
  );
}

export function ChangeOwnPasswordForm() {
  const id = useId();
  const form = useActionForm(
    { currentPassword: "", newPassword: "" },
    (values) =>
      validateThenRun(changeOwnPasswordSchema, values, changeOwnPassword),
    {
      success: "Password changed. Your other devices have been signed out.",
      resetOnSuccess: true,
    },
  );
  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-4"
    >
      <FormField
        id={`${id}-current`}
        label="Current password"
        error={form.error("currentPassword")}
      >
        <PasswordInput
          id={`${id}-current`}
          value={form.values.currentPassword}
          onChange={(v) => form.set("currentPassword", v)}
          autoComplete="current-password"
          invalid={!!form.error("currentPassword")}
        />
      </FormField>
      <FormField
        id={`${id}-new`}
        label="New password"
        error={form.error("newPassword")}
        help="At least 10 characters."
      >
        <PasswordInput
          id={`${id}-new`}
          value={form.values.newPassword}
          onChange={(v) => form.set("newPassword", v)}
          autoComplete="new-password"
          invalid={!!form.error("newPassword")}
        />
      </FormField>
      <FormMessage message={form.message} />
      <SubmitButton pending={form.pending} label="Change password" />
    </form>
  );
}

/** Deactivate (after a confirmation) or reactivate a user. */
export function UserStatusButton({
  userId,
  name,
  active,
}: {
  userId: string;
  name: string;
  active: boolean;
}) {
  const { run, pending, message } = useActionButton(setUserActiveSchema);

  function toggle() {
    if (
      active &&
      !window.confirm(
        `Deactivate ${name}? They'll be signed out and can't sign in until reactivated.`,
      )
    ) {
      return;
    }
    run(setUserActive, { id: userId, active: !active });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={active ? "destructive" : "outline"}
        className="h-11 sm:w-fit"
        onClick={toggle}
        disabled={pending}
      >
        {pending ? "Saving…" : active ? "Deactivate user" : "Reactivate user"}
      </Button>
      <FormMessage message={message} />
    </div>
  );
}
