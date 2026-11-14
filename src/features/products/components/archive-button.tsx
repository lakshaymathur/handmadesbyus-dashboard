"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { validateThenRun } from "@/lib/client-action";
import type { FormMessageState } from "@/lib/use-action-form";
import { setProductArchived } from "../actions";
import { setArchivedSchema } from "../schema";

/** Archive a product (kept for past orders, hidden from new ones) or bring it back. */
export function ArchiveButton({
  productId,
  archived,
}: {
  productId: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<FormMessageState>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 sm:w-fit"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await validateThenRun(
              setArchivedSchema,
              { id: productId, archived: !archived },
              setProductArchived,
            );
            if (result && !result.ok) {
              setMessage({ ok: false, text: result.error });
            }
          });
        }}
      >
        {archived ? "Bring back" : "Archive"}
      </Button>
      <FormMessage message={message} />
    </div>
  );
}
