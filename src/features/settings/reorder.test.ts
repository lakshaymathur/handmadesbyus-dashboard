import { describe, expect, it } from "vitest";
import { moveInList } from "./reorder";

describe("moveInList", () => {
  const ids = ["a", "b", "c"];

  it("swaps with the neighbour", () => {
    expect(moveInList(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInList(ids, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("returns null at the ends or for an unknown id", () => {
    expect(moveInList(ids, "a", "up")).toBeNull();
    expect(moveInList(ids, "c", "down")).toBeNull();
    expect(moveInList(ids, "x", "up")).toBeNull();
  });

  it("doesn't change the input", () => {
    moveInList(ids, "b", "up");
    expect(ids).toEqual(["a", "b", "c"]);
  });
});
