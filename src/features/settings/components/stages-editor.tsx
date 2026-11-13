"use client";

import { validateThenRun } from "@/lib/client-action";
import { addStage, deleteStage, moveStage, renameStage } from "../actions";
import type { ManagedItem } from "../queries";
import { addStageSchema, idSchema, moveSchema, renameSchema } from "../schema";
import { ManagedList } from "./managed-list";

/** A category's production stages, in order. */
export function StagesEditor({
  categoryId,
  items,
}: {
  categoryId: string;
  items: ManagedItem[];
}) {
  return (
    <ManagedList
      noun="stage"
      items={items}
      onAdd={({ name }) =>
        validateThenRun(addStageSchema, { categoryId, name }, addStage)
      }
      onUpdate={(id, { name }) =>
        validateThenRun(renameSchema, { id, name }, renameStage)
      }
      onMove={(id, direction) =>
        validateThenRun(moveSchema, { id, direction }, moveStage)
      }
      onDelete={(id) => validateThenRun(idSchema, { id }, deleteStage)}
    />
  );
}
