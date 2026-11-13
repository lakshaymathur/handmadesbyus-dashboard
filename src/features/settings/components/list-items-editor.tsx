"use client";

import { validateThenRun } from "@/lib/client-action";
import {
  addListItem,
  moveListItem,
  renameListItem,
  setListItemActive,
} from "../actions";
import type { ManagedItem } from "../queries";
import {
  addListItemSchema,
  moveSchema,
  renameListItemSchema,
  setActiveSchema,
  type ListKind,
} from "../schema";
import { ManagedList } from "./managed-list";

/** Product types, colours, designs or aggregators. */
export function ListItemsEditor({
  kind,
  noun,
  items,
}: {
  kind: ListKind;
  noun: string;
  items: ManagedItem[];
}) {
  return (
    <ManagedList
      noun={noun}
      items={items}
      onAdd={({ name }) =>
        validateThenRun(addListItemSchema, { kind, name }, addListItem)
      }
      onUpdate={(id, { name }) =>
        validateThenRun(renameListItemSchema, { id, name }, renameListItem)
      }
      onSetActive={(id, active) =>
        validateThenRun(setActiveSchema, { id, active }, setListItemActive)
      }
      onMove={(id, direction) =>
        validateThenRun(moveSchema, { id, direction }, moveListItem)
      }
    />
  );
}
