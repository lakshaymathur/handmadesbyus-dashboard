"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateThenRun } from "@/lib/client-action";
import { cn } from "@/lib/utils";
import { updateGeneralSettings } from "../actions";
import type { GeneralSettings } from "../queries";
import { generalSettingsSchema } from "../schema";

export function GeneralSettingsForm({ initial }: { initial: GeneralSettings }) {
  const id = useId();
  const [dueSoonDays, setDueSoonDays] = useState(String(initial.dueSoonDays));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await validateThenRun(
        generalSettingsSchema,
        { dueSoonDays },
        updateGeneralSettings,
      );
      setMessage(
        result.ok
          ? { ok: true, text: "Saved." }
          : {
              ok: false,
              text: result.fieldErrors?.dueSoonDays?.[0] ?? result.error,
            },
      );
    });
  }

  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-due`}>
          &ldquo;Due soon&rdquo; warning (days)
        </Label>
        <Input
          id={`${id}-due`}
          value={dueSoonDays}
          onChange={(e) => {
            setDueSoonDays(e.target.value);
            setMessage(null);
          }}
          inputMode="numeric"
          className="h-11 w-32"
          aria-invalid={message && !message.ok ? true : undefined}
          aria-describedby={`${id}-due-help`}
        />
        <p
          id={`${id}-due-help`}
          role={message ? (message.ok ? "status" : "alert") : undefined}
          className={cn(
            "text-sm",
            message && !message.ok
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {message?.text ??
            "Orders whose promised date is this many days away or closer are flagged “Due soon”."}
        </p>
      </div>
      <Button type="submit" className="h-11 sm:w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
