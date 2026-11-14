"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { validateThenRun } from "@/lib/client-action";
import type { FormMessageState } from "@/lib/use-action-form";
import { deleteProduct } from "../actions";
import { productIdSchema } from "../schema";

/** Deletes a product that's never been on an order; going back to the list on success. */
export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<FormMessageState>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 text-destructive sm:w-fit"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Delete “${productName}” and its photos? This can't be undone.`,
            )
          ) {
            return;
          }
          setMessage(null);
          startTransition(async () => {
            const result = await validateThenRun(
              productIdSchema,
              { id: productId },
              deleteProduct,
            );
            if (result && !result.ok) {
              setMessage({ ok: false, text: result.error });
            }
          });
        }}
      >
        {pending ? "Deleting…" : "Delete product"}
      </Button>
      <FormMessage message={message} />
    </div>
  );
}
