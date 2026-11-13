import { describe, expect, it } from "vitest";
import { formatMoney, moneyField, paiseToInput, parseMoney } from "./money";

describe("formatMoney", () => {
  it.each([
    [0, "₹0"],
    [100, "₹1"],
    [12345600, "₹1,23,456"],
    [1000000000, "₹1,00,00,000"],
    [123450, "₹1,234.50"],
    [5, "₹0.05"],
    [-50000, "-₹500"],
    [-123405, "-₹1,234.05"],
  ])("formats %i paise as %s", (paise, text) => {
    expect(formatMoney(paise)).toBe(text);
  });

  it("is exact for the largest safe amount", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe(
      "₹9,00,71,99,25,47,409.91",
    );
  });

  it.each([1.5, Number.NaN, Infinity, 2 ** 53])(
    "rejects %s (not whole paise)",
    (bad) => {
      expect(() => formatMoney(bad)).toThrow(TypeError);
    },
  );
});

describe("parseMoney", () => {
  it.each([
    ["1250", 125000],
    ["1,250", 125000],
    ["1,23,456", 12345600],
    ["123,456", 12345600],
    ["1234.5", 123450],
    ["1234.50", 123450],
    ["0.05", 5],
    ["₹1,200", 120000],
    ["₹ 1200", 120000],
    ["Rs. 500", 50000],
    ["rs 500", 50000],
    ["INR 500", 50000],
    ["  750  ", 75000],
    ["-500", -50000],
    ["- ₹500", -50000],
    ["0", 0],
    ["-0", 0],
  ])("parses %j as %i paise", (text, paise) => {
    expect(parseMoney(text)).toBe(paise);
  });

  it.each([
    [""],
    ["abc"],
    ["12.345"],
    ["1,2,3"],
    ["1e5"],
    ["0x10"],
    [".5"],
    ["5."],
    ["1 000"],
    ["--5"],
    ["99999999999999999"],
  ])("rejects %j", (text) => {
    expect(parseMoney(text)).toBeNull();
  });

  it("round-trips with paiseToInput", () => {
    for (const paise of [0, 5, 50, 100, 123450, 12345600, -50000, -5]) {
      expect(parseMoney(paiseToInput(paise))).toBe(paise);
    }
  });
});

describe("moneyField", () => {
  it("turns typed text into paise", () => {
    expect(moneyField().parse("1,250.50")).toBe(125050);
  });

  it("rejects text that isn't an amount", () => {
    const result = moneyField().safeParse("twelve");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Enter an amount/);
  });

  it("rejects negatives unless allowed", () => {
    expect(moneyField().safeParse("-100").success).toBe(false);
    expect(moneyField({ allowNegative: true }).parse("-100")).toBe(-10000);
  });
});

describe("paiseToInput", () => {
  it.each([
    [0, "0"],
    [50000, "500"],
    [123450, "1234.50"],
    [5, "0.05"],
    [-123405, "-1234.05"],
  ])("writes %i paise as %j", (paise, text) => {
    expect(paiseToInput(paise)).toBe(text);
  });
});
