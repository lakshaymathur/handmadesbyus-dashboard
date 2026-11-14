"use client";

import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { useActionButton } from "@/lib/use-action-button";
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
  const { run, pending, message } = useActionButton(setArchivedSchema);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 sm:w-fit"
        disabled={pending}
        onClick={() =>
          run(setProductArchived, { id: productId, archived: !archived })
        }
      >
        {archived ? "Bring back" : "Archive"}
      </Button>
      <FormMessage message={message} />
    </div>
  );
}
