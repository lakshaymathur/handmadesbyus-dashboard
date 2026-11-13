import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/orders", "/orders"],
    ["/orders/HMU-2611-0001?tab=items", "/orders/HMU-2611-0001?tab=items"],
    ["/", "/"],
    ["/orders#items", "/orders#items"],
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
    ["/login/"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["/\r\n/evil.example"],
    ["/ /evil.example"],
    ["/\u0000/evil.example"],
    ["/orders\\..\\evil"],
  ])("falls back to / for %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });

  it("never yields a path that a browser resolves to another origin", () => {
    // Every result must stay on our origin when the browser resolves it.
    const attempts = [
      "/\t/evil.example",
      "//evil.example",
      "/%2F%2Fevil.example",
      "/./evil",
    ];
    for (const attempt of attempts) {
      const target = new URL(safeNextPath(attempt), "https://dash.example.com");
      expect(target.origin).toBe("https://dash.example.com");
    }
  });
});
