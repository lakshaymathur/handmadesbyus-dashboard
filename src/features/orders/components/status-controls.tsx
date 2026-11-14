"use client";

import { useId, useState } from "react";
import { FormMessage } from "@/components/form-field";
import { SelectField, TextField, type Bind } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { validateThenRun } from "@/lib/client-action";
import { useActionButton } from "@/lib/use-action-button";
import { useActionForm } from "@/lib/use-action-form";
import { changeStatus } from "../actions";
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "../lifecycle";
import { statusChangeSchema, type StatusChangeFormInput } from "../schema";

/**
 * Order status (§2.6): "Mark ready for pickup" once every item is finished (one tap,
 * never automatic), and "Change status" for everything else, asking for what each status
 * needs (delivered date, cancel reason). The server checks the rules again.
 */
export function StatusControls({
  orderId,
  status,
  allFinished,
  today,
}: {
  orderId: string;
  status: OrderStatus;
  allFinished: boolean;
  /** Today in India (from the server). */
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const quick = useActionButton(statusChangeSchema);
  const base = {
    orderId,
    note: "",
    deliveredDate: "",
    cancelReason: "",
    refundOwed: false,
  };

  return (
    <div className="flex flex-col gap-3">
      {status === "in_production" && allFinished && !open && (
        <Button
          type="button"
          className="h-11 sm:w-fit"
          disabled={quick.pending}
          onClick={() =>
            quick.run(changeStatus, { ...base, to: "ready_for_pickup" })
          }
        >
          Mark ready for pickup
        </Button>
      )}
      <FormMessage message={quick.message} />
      {open ? (
        <ChangeStatusForm
          base={base}
          status={status}
          today={today}
          onDone={() => setOpen(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:w-fit"
          onClick={() => setOpen(true)}
        >
          Change status
        </Button>
      )}
    </div>
  );
}

function ChangeStatusForm({
  base,
  status,
  today,
  onDone,
}: {
  base: Omit<StatusChangeFormInput, "to">;
  status: OrderStatus;
  today: string;
  onDone: () => void;
}) {
  const idPrefix = useId();
  const choices = ORDER_STATUSES.filter((s) => s !== status);
  const form = useActionForm<StatusChangeFormInput>(
    // Nothing preselected: a stray Save mustn't move the order anywhere.
    { ...base, to: "", deliveredDate: today },
    (values) => validateThenRun(statusChangeSchema, values, changeStatus),
    { onSuccess: onDone },
  );
  const bind: Bind<StatusChangeFormInput> = {
    idPrefix,
    values: form.values,
    error: form.error,
    set: (key, value) => form.set(key, value as never),
  };
  const to = form.values.to;

  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      className="flex flex-col gap-4 rounded-lg border p-3"
    >
      <SelectField
        bind={bind}
        name="to"
        label={`Move from “${STATUS_LABELS[status]}” to`}
        options={choices.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        placeholder="Choose the new status"
      />
      {to === "delivered" && (
        <TextField
          bind={bind}
          name="deliveredDate"
          label="Delivered on"
          type="date"
          help="Revenue counts on this date"
        />
      )}
      {to === "cancelled" && (
        <>
          <TextField
            bind={bind}
            name="cancelReason"
            label="Why is it cancelled?"
          />
          <label className="flex h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.values.refundOwed}
              onChange={(e) => form.set("refundOwed", e.target.checked)}
              className="size-5 accent-foreground"
            />
            A refund is owed
          </label>
        </>
      )}
      <TextField
        bind={bind}
        name="note"
        label="Note (optional)"
        help="Saved in the history, e.g. why it moved back"
      />
      <FormMessage message={form.message} />
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={form.pending}>
          {form.pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
