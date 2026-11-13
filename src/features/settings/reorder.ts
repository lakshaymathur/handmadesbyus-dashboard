import type { MoveDirection } from "./schema";

/**
 * `ids` (in display order) with `id` moved one place up or down, or null if it can't
 * move (not found, or already first/last).
 */
export function moveInList(
  ids: readonly string[],
  id: string,
  direction: MoveDirection,
): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
