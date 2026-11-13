import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/orders", "/orders"],
    ["/orders/HMU-2611-0001?tab=items", "/orders/HMU-2611-0001?tab=items"],
    ["/", "/"],
  ])("keeps the in-app path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["orders"],
    ["https://evil.example"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["/login"],
    ["/login?next=/orders"],
  ])("falls back to / for %s", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
