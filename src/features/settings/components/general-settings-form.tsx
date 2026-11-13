"use client";

import { useId } from "react";
import { FormField, FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateThenRun } from "@/lib/client-action";
import { useActionForm } from "@/lib/use-action-form";
import { updateGeneralSettings } from "../actions";
import type { GeneralSettings } from "../queries";
import { generalSettingsSchema } from "../schema";

export function GeneralSettingsForm({ initial }: { initial: GeneralSettings }) {
  const id = useId();
  const form = useActionForm(
    { dueSoonDays: String(initial.dueSoonDays) },
    (values) =>
      validateThenRun(generalSettingsSchema, values, updateGeneralSettings),
    { success: "Saved." },
  );
  const dueId = `${id}-due`;

  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-4"
    >
      <FormField
        id={dueId}
        label="“Due soon” warning (days)"
        error={form.error("dueSoonDays")}
        help="Orders whose promised date is this many days away or closer are flagged “Due soon”."
      >
        <Input
          id={dueId}
          value={form.values.dueSoonDays}
          onChange={(e) => form.set("dueSoonDays", e.target.value)}
          inputMode="numeric"
          className="h-11 w-32"
          aria-invalid={form.error("dueSoonDays") ? true : undefined}
          aria-describedby={`${dueId}-note`}
        />
      </FormField>
      <FormMessage message={form.message} />
      <Button type="submit" className="h-11 sm:w-fit" disabled={form.pending}>
        {form.pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
