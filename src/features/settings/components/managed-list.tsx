"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { FormField, FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClientResult } from "@/lib/client-action";
import { useActionForm } from "@/lib/use-action-form";
import { cn } from "@/lib/utils";
import type { ManagedItem } from "../queries";
import type { MoveDirection } from "../schema";

export type ItemValues = { name: string; detail: string };

/** A second text field after the name (e.g. a delivery partner's tracking link). */
export type DetailField = {
  key: string; // field name in the form's Zod schema, for its errors
  label: string;
  placeholder: string;
  help: string;
};

type Result = ClientResult;

type Props = {
  noun: string; // "colour"
  plural?: string; // defaults to noun + "s"
  items: ManagedItem[];
  detailField?: DetailField;
  /** Inline add and edit; leave out when entries are edited on their own page. */
  onAdd?: (values: ItemValues) => Promise<Result>;
  onUpdate?: (id: string, values: ItemValues) => Promise<Result>;
  onMove: (id: string, direction: MoveDirection) => Promise<Result>;
  /** Lists whose entries are referenced elsewhere deactivate instead of deleting. */
  onSetActive?: (id: string, active: boolean) => Promise<Result>;
  /** Hard delete, after a confirmation. The server refuses entries still in use. */
  onDelete?: (id: string) => Promise<Result>;
};

/**
 * An editable list: add, rename, reorder, and deactivate or delete. Inactive entries stay
 * listed so they can come back. Entries with an `href` link to their own page.
 */
export function ManagedList(props: Props) {
  const { items, noun, plural = `${noun}s` } = props;
  return (
    <div className="flex flex-col gap-6">
      {items.length === 0 ? (
        <p className="text-muted-foreground">No {plural} yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item, index) => (
            <Row
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              {...props}
            />
          ))}
        </ul>
      )}
      {props.onAdd && (
        <ItemForm
          title={`Add a ${noun}`}
          submitLabel="Add"
          detailField={props.detailField}
          initial={{ name: "", detail: "" }}
          onSubmit={props.onAdd}
          resetOnSuccess
        />
      )}
    </div>
  );
}

function Row({
  item,
  isFirst,
  isLast,
  noun,
  detailField,
  onUpdate,
  onSetActive,
  onDelete,
  onMove,
}: Props & { item: ManagedItem; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<Result>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) setError(result.error);
    });
  }

  if (editing && onUpdate) {
    return (
      <li className="p-3">
        <ItemForm
          title={`Edit ${noun}`}
          submitLabel="Save"
          detailField={detailField}
          initial={{ name: item.name, detail: item.detail ?? "" }}
          onSubmit={(values) => onUpdate(item.id, values)}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={cn("flex flex-col gap-1 p-3", pending && "opacity-60")}>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          {item.href ? (
            <Link
              href={item.href}
              className={cn(
                "flex min-h-10 items-center gap-1 font-medium underline-offset-4 hover:underline",
                !item.active && "text-muted-foreground line-through",
              )}
            >
              <span className="break-words">{item.name}</span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          ) : (
            <span
              className={cn(
                "font-medium break-words",
                !item.active && "text-muted-foreground line-through",
              )}
            >
              {item.name}
            </span>
          )}
          {item.detail && (
            <span className="text-xs wrap-anywhere text-muted-foreground">
              {item.detail}
            </span>
          )}
          {!item.active && (
            <span className="text-xs text-muted-foreground">
              Inactive: hidden from new {noun} pickers
            </span>
          )}
        </div>
        <IconButton
          label={`Move ${item.name} up`}
          disabled={pending || isFirst}
          onClick={() => run(() => onMove(item.id, "up"))}
        >
          <ArrowUp />
        </IconButton>
        <IconButton
          label={`Move ${item.name} down`}
          disabled={pending || isLast}
          onClick={() => run(() => onMove(item.id, "down"))}
        >
          <ArrowDown />
        </IconButton>
        {onUpdate && (
          <IconButton
            label={`Edit ${item.name}`}
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </IconButton>
        )}
        {onSetActive && (
          <IconButton
            label={
              item.active
                ? `Deactivate ${item.name}`
                : `Reactivate ${item.name}`
            }
            disabled={pending}
            onClick={() => run(() => onSetActive(item.id, !item.active))}
          >
            {item.active ? <EyeOff /> : <Eye />}
          </IconButton>
        )}
        {onDelete && (
          <IconButton
            label={`Delete ${item.name}`}
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(`Delete "${item.name}"? This can't be undone.`)
              ) {
                run(() => onDelete(item.id));
              }
            }}
          >
            <Trash2 />
          </IconButton>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function IconButton({
  label,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 shrink-0"
      aria-label={label}
      title={label}
      {...props}
    />
  );
}

function ItemForm({
  title,
  submitLabel,
  detailField,
  initial,
  onSubmit,
  onDone,
  resetOnSuccess = false,
}: {
  title: string;
  submitLabel: string;
  detailField?: DetailField;
  initial: ItemValues;
  onSubmit: (values: ItemValues) => Promise<Result>;
  onDone?: () => void;
  resetOnSuccess?: boolean;
}) {
  const id = useId();
  const form = useActionForm(initial, onSubmit, {
    resetOnSuccess,
    onSuccess: onDone,
  });
  const nameId = `${id}-name`;
  const detailId = `${id}-detail`;
  const detailError = detailField && form.error(detailField.key);

  return (
    <form
      method="post"
      onSubmit={form.submit}
      noValidate
      aria-label={title}
      className="flex flex-col gap-3"
    >
      <FormField id={nameId} label={title} error={form.error("name")}>
        <Input
          id={nameId}
          value={form.values.name}
          onChange={(e) => form.set("name", e.target.value)}
          placeholder="Name"
          autoComplete="off"
          className="h-11"
          aria-invalid={form.error("name") ? true : undefined}
          aria-describedby={`${nameId}-note`}
        />
      </FormField>
      {detailField && (
        <FormField
          id={detailId}
          label={detailField.label}
          error={detailError}
          help={detailField.help}
        >
          <Input
            id={detailId}
            value={form.values.detail}
            onChange={(e) =>
              form.set("detail", e.target.value, detailField.key)
            }
            placeholder={detailField.placeholder}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11"
            aria-invalid={detailError ? true : undefined}
            aria-describedby={`${detailId}-note`}
          />
        </FormField>
      )}
      <FormMessage message={form.message} />
      <div className="flex gap-2">
        <Button
          type="submit"
          className="h-11 flex-1 sm:flex-none"
          disabled={form.pending}
        >
          {submitLabel === "Add" && <Plus aria-hidden />}
          {form.pending ? "Saving…" : submitLabel}
        </Button>
        {onDone && (
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 sm:flex-none"
            onClick={onDone}
            disabled={form.pending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
