"use client";

import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { useActionButton } from "@/lib/use-action-button";
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
  const { run, pending, message } = useActionButton(productIdSchema);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 text-destructive sm:w-fit"
        disabled={pending}
        onClick={() => {
          if (
            window.confirm(
              `Delete “${productName}” and its photos? This can't be undone.`,
            )
          ) {
            run(deleteProduct, { id: productId });
          }
        }}
      >
        {pending ? "Deleting…" : "Delete product"}
      </Button>
      <FormMessage message={message} />
    </div>
  );
}
