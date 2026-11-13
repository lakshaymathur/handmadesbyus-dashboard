import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "./reset";

describe("assertLocalDatabase", () => {
  it.each([
    "postgres://u:p@localhost:5432/app",
    "postgres://u:p@127.0.0.1/app",
    "postgres://u:p@[::1]:5432/app",
    "postgres://u:p@postgres:5432/app",
  ])("allows %s", (url) => {
    expect(() => assertLocalDatabase(url)).not.toThrow();
  });

  it.each([
    "postgres://u:p@db.example.com/app",
    "postgres://u:p@10.0.0.5/app",
    "postgres://u:p@localhost.evil.com/app",
  ])("refuses %s", (url) => {
    expect(() => assertLocalDatabase(url)).toThrowError(/Refusing to wipe/);
  });

  it("does not echo the password", () => {
    expect(() =>
      assertLocalDatabase("postgres://u:hunter2@db.example.com/app"),
    ).toThrowError(/^(?!.*hunter2)/s);
  });
});
