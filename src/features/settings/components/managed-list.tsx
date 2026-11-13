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
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/auth/action";
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

type Result = ActionResult<unknown>;

type Props = {
  noun: string; // "colour"
  plural?: string; // defaults to noun + "s"
  items: ManagedItem[];
  detailField?: DetailField;
  onAdd: (values: ItemValues) => Promise<Result>;
  onUpdate: (id: string, values: ItemValues) => Promise<Result>;
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
        <p className="text-muted-foreground">
          No {plural} yet. Add the first below.
        </p>
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
      <ItemForm
        title={`Add a ${noun}`}
        submitLabel="Add"
        detailField={props.detailField}
        initial={{ name: "", detail: "" }}
        onSubmit={props.onAdd}
        resetOnSuccess
      />
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
      if (!result.ok) setError(result.error);
    });
  }

  if (editing) {
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
        <IconButton
          label={`Edit ${item.name}`}
          disabled={pending}
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </IconButton>
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
  const [values, setValues] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.ok) {
        setFieldErrors({});
        if (resetOnSuccess) setValues(initial);
        onDone?.();
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      // Field errors show next to their field; only repeat the message if none do.
      if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) {
        setError(result.error);
      }
    });
  }

  const nameError = fieldErrors.name?.[0];
  const detailError = detailField && fieldErrors[detailField.key]?.[0];

  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      aria-label={title}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>{title}</Label>
        <Input
          id={`${id}-name`}
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          placeholder="Name"
          autoComplete="off"
          className="h-11"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
        />
        {nameError && (
          <p id={`${id}-name-error`} className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>
      {detailField && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-detail`}>{detailField.label}</Label>
          <Input
            id={`${id}-detail`}
            value={values.detail}
            onChange={(e) => setValues({ ...values, detail: e.target.value })}
            placeholder={detailField.placeholder}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11"
            aria-invalid={detailError ? true : undefined}
            aria-describedby={`${id}-detail-help`}
          />
          <p
            id={`${id}-detail-help`}
            className={cn(
              "text-sm",
              detailError ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {detailError ?? detailField.help}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          className="h-11 flex-1 sm:flex-none"
          disabled={pending}
        >
          {submitLabel === "Add" && <Plus aria-hidden />}
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onDone && (
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 sm:flex-none"
            onClick={onDone}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
