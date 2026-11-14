import { describe, expect, it } from "vitest";
import {
  formatSize,
  formatWeight,
  mmToCmInput,
  optionalCmField,
  optionalGramsField,
  parseCm,
} from "./units";

describe("parseCm", () => {
  it.each([
    ["20", 200],
    ["12.5", 125],
    [" 7.0 ", 70],
    ["0.5", 5],
    ["1234.5", 12345],
  ])("%s cm → %i mm", (text, mm) => {
    expect(parseCm(text)).toBe(mm);
  });

  it.each(["", "12.55", "-1", "abc", "1,2", "12345", ".5"])(
    "rejects %j",
    (text) => {
      expect(parseCm(text)).toBeNull();
    },
  );
});

describe("mmToCmInput", () => {
  it("round-trips with parseCm", () => {
    for (const mm of [5, 70, 125, 200, 12345]) {
      expect(parseCm(mmToCmInput(mm))).toBe(mm);
    }
    expect(mmToCmInput(120)).toBe("12");
    expect(mmToCmInput(125)).toBe("12.5");
  });
});

describe("form fields", () => {
  it("sizes: blank is null, zero and junk are errors", () => {
    const cm = optionalCmField();
    expect(cm.parse("")).toBeNull();
    expect(cm.parse("12.5")).toBe(125);
    expect(cm.safeParse("0").success).toBe(false);
    expect(cm.safeParse("12.55").success).toBe(false);
  });

  it("weights: whole grams up to 100 kg", () => {
    const g = optionalGramsField();
    expect(g.parse(" ")).toBeNull();
    expect(g.parse("350")).toBe(350);
    expect(g.safeParse("0").success).toBe(false);
    expect(g.safeParse("350.5").success).toBe(false);
    expect(g.safeParse("100001").success).toBe(false);
  });
});

describe("formatting", () => {
  it("shows sizes in cm with ? for a missing side", () => {
    expect(formatSize(200, 200, 100)).toBe("20 × 20 × 10 cm");
    expect(formatSize(255, null, 120)).toBe("25.5 × ? × 12 cm");
    expect(formatSize(null, null, null)).toBeNull();
  });

  it("shows weights in g or kg", () => {
    expect(formatWeight(350)).toBe("350 g");
    expect(formatWeight(1000)).toBe("1 kg");
    expect(formatWeight(1250)).toBe("1.25 kg");
  });
});
