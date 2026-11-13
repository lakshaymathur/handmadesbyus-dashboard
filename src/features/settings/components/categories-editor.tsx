"use client";

import { validateThenRun } from "@/lib/client-action";
import {
  addCategory,
  moveCategory,
  renameCategory,
  setCategoryActive,
} from "../actions";
import type { ManagedItem } from "../queries";
import {
  addCategorySchema,
  moveSchema,
  renameSchema,
  setActiveSchema,
} from "../schema";
import { ManagedList } from "./managed-list";

export function CategoriesEditor({ items }: { items: ManagedItem[] }) {
  return (
    <ManagedList
      noun="category"
      plural="categories"
      items={items}
      onAdd={({ name }) =>
        validateThenRun(addCategorySchema, { name }, addCategory)
      }
      onUpdate={(id, { name }) =>
        validateThenRun(renameSchema, { id, name }, renameCategory)
      }
      onSetActive={(id, active) =>
        validateThenRun(setActiveSchema, { id, active }, setCategoryActive)
      }
      onMove={(id, direction) =>
        validateThenRun(moveSchema, { id, direction }, moveCategory)
      }
    />
  );
}
