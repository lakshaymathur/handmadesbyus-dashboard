"use client";

import { validateThenRun } from "@/lib/client-action";
import {
  moveCustomisationOption,
  setCustomisationOptionActive,
} from "../actions";
import type { ManagedItem } from "../queries";
import { moveSchema, setActiveSchema } from "../schema";
import { ManagedList } from "./managed-list";

/** The options list: reorder and deactivate here; everything else on each option's page. */
export function CustomisationOptionsEditor({
  items,
}: {
  items: ManagedItem[];
}) {
  return (
    <ManagedList
      noun="customisation option"
      items={items}
      onSetActive={(id, active) =>
        validateThenRun(
          setActiveSchema,
          { id, active },
          setCustomisationOptionActive,
        )
      }
      onMove={(id, direction) =>
        validateThenRun(moveSchema, { id, direction }, moveCustomisationOption)
      }
    />
  );
}
