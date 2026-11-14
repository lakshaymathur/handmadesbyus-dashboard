"use client";

import { FormMessage } from "@/components/form-field";
import { selectClass } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { useActionButton } from "@/lib/use-action-button";
import { cn } from "@/lib/utils";
import { changeItemStages } from "../actions";
import { nextStage, type Stage } from "../lifecycle";
import { stageChangeSchema } from "../schema";

type Item = {
  id: string;
  productName: string;
  categoryId: string;
  stage: Stage;
  stages: Stage[];
  finished: boolean;
};

/**
 * Production stages (§2.6). An order of one category moves all its items together with
 * one button; any item can also be set to any of its stages (forward or back). Stages are
 * locked unless the order is In production or On hold (`lockedReason`).
 */
export function StageControls({
  orderId,
  items,
  lockedReason,
}: {
  orderId: string;
  items: Item[];
  lockedReason: string | null;
}) {
  const { run, pending, message } = useActionButton(stageChangeSchema);
  const finished = items.filter((i) => i.finished).length;
  const oneCategory = new Set(items.map((i) => i.categoryId)).size === 1;
  const first = items[0];

  // One category: the stage after the furthest-behind item; items behind it catch up.
  const behind = first
    ? items.reduce((a, b) => (b.stage.position < a.stage.position ? b : a))
    : null;
  const target =
    oneCategory && behind ? nextStage(behind.stages, behind.stage.id) : null;
  const sameStage = items.every((i) => i.stage.id === first?.stage.id);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {oneCategory && sameStage && first ? (
          <>
            Stage: <span className="font-medium">{first.stage.name}</span>
            {first.finished && " (finished)"}
          </>
        ) : (
          <>
            In production:{" "}
            <span className="font-medium">
              {finished} of {items.length} items finished
            </span>
          </>
        )}
      </p>

      {lockedReason ? (
        <p className="text-sm text-muted-foreground">{lockedReason}</p>
      ) : (
        <>
          {target && (
            <Button
              type="button"
              className="h-11 sm:w-fit"
              disabled={pending}
              onClick={() =>
                run(changeItemStages, {
                  orderId,
                  items: items
                    .filter((i) => i.stage.position < target.position)
                    .map((i) => ({ itemId: i.id, stageId: target.id })),
                })
              }
            >
              {sameStage ? "Next stage" : "Bring all to"}: {target.name}
            </Button>
          )}
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="wrap-anywhere text-muted-foreground">
                    {item.productName}
                  </span>
                  <select
                    value={item.stage.id}
                    disabled={pending}
                    onChange={(e) =>
                      run(changeItemStages, {
                        orderId,
                        items: [{ itemId: item.id, stageId: e.target.value }],
                      })
                    }
                    className={cn(selectClass, "h-10")}
                  >
                    {item.stages.map((stage, index) => (
                      <option key={stage.id} value={stage.id}>
                        {index + 1}. {stage.name}
                        {index === item.stages.length - 1 ? " (finished)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <FormMessage message={message} />
    </div>
  );
}
