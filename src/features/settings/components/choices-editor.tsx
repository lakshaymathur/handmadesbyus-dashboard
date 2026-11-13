"use client";

import { validateThenRun } from "@/lib/client-action";
import {
  addChoice,
  moveChoice,
  renameChoice,
  setChoiceActive,
} from "../actions";
import type { ManagedItem } from "../queries";
import {
  addChoiceSchema,
  moveSchema,
  renameSchema,
  setActiveSchema,
} from "../schema";
import { ManagedList } from "./managed-list";

/** The choices of a "choice from a list" option (e.g. Latkan colours). */
export function ChoicesEditor({
  optionId,
  items,
}: {
  optionId: string;
  items: ManagedItem[];
}) {
  return (
    <ManagedList
      noun="choice"
      items={items}
      onAdd={({ name }) =>
        validateThenRun(addChoiceSchema, { optionId, name }, addChoice)
      }
      onUpdate={(id, { name }) =>
        validateThenRun(renameSchema, { id, name }, renameChoice)
      }
      onSetActive={(id, active) =>
        validateThenRun(setActiveSchema, { id, active }, setChoiceActive)
      }
      onMove={(id, direction) =>
        validateThenRun(moveSchema, { id, direction }, moveChoice)
      }
    />
  );
}
