import { describe, expect, it } from "vitest";
import {
  discountAmount,
  lineCost,
  lineTotal,
  orderTotals,
  parsePercent,
  percentToInput,
  type PricedItem,
} from "./pricing";

const box: PricedItem = {
  quantity: 2,
  unitPrice: 120_000, // ₹1200
  unitCost: 45_000,
  customisations: [
    { price: 5_000, cost: 1_500 }, // latkan ₹50
    { price: 3_000, cost: 500 }, // sticker ₹30
  ],
};

describe("line totals", () => {
  it("is (unit price + customisations) × quantity", () => {
    expect(lineTotal(box)).toBe(2 * (120_000 + 5_000 + 3_000));
    expect(lineCost(box)).toBe(2 * (45_000 + 1_500 + 500));
    expect(lineTotal({ ...box, quantity: 1, customisations: [] })).toBe(
      120_000,
    );
  });

  it("refuses impossible quantities and amounts", () => {
    expect(() => lineTotal({ ...box, quantity: 0 })).toThrow(RangeError);
    expect(() => lineTotal({ ...box, quantity: 1.5 })).toThrow(RangeError);
    expect(() => lineTotal({ ...box, unitPrice: -1 })).toThrow(RangeError);
    expect(() => lineTotal({ ...box, unitPrice: 0.5 })).toThrow(RangeError);
  });
});

describe("discounts", () => {
  it("flat: never more than the subtotal", () => {
    expect(discountAmount(100_000, { type: "flat", paise: 10_000 })).toBe(
      10_000,
    );
    expect(discountAmount(100_000, { type: "flat", paise: 200_000 })).toBe(
      100_000,
    );
    expect(discountAmount(100_000, { type: "none" })).toBe(0);
  });

  it("percent: rounds half up to the paisa, in whole numbers", () => {
    expect(discountAmount(100_000, { type: "percent", bp: 1_000 })).toBe(
      10_000,
    );
    // 12.5% of ₹10.01 = 125.125 paise → 125; 12.5% of ₹10.05 = 125.625 → 126
    expect(discountAmount(1_001, { type: "percent", bp: 1_250 })).toBe(125);
    expect(discountAmount(1_005, { type: "percent", bp: 1_250 })).toBe(126);
    // exactly half a paisa rounds up: 50% of 1 paisa
    expect(discountAmount(1, { type: "percent", bp: 5_000 })).toBe(1);
    expect(discountAmount(99_999, { type: "percent", bp: 10_000 })).toBe(
      99_999,
    );
    expect(() => discountAmount(1, { type: "percent", bp: 10_001 })).toThrow();
  });
});

describe("orderTotals", () => {
  it("adds items, takes the discount off and adds shipping", () => {
    const totals = orderTotals({
      items: [box, { ...box, quantity: 1, customisations: [] }],
      discount: { type: "percent", bp: 1_000 },
      shippingCharged: 8_000,
    });
    const subtotal = 256_000 + 120_000;
    expect(totals).toEqual({
      subtotal,
      customisations: 16_000,
      discount: 37_600,
      shippingCharged: 8_000,
      total: subtotal - 37_600 + 8_000,
      cost: 2 * 47_000 + 45_000,
    });
  });

  it("an order with free shipping and no discount totals its items", () => {
    expect(
      orderTotals({
        items: [box],
        discount: { type: "none" },
        shippingCharged: 0,
      }).total,
    ).toBe(lineTotal(box));
  });
});

describe("percent input", () => {
  it.each([
    ["10", 1_000],
    ["12.5", 1_250],
    ["12.55", 1_255],
    [" 7 % ", 700],
    ["100", 10_000],
    ["0", 0],
  ])("%j → %i bp", (text, bp) => {
    expect(parsePercent(text)).toBe(bp);
    expect(parsePercent(percentToInput(bp))).toBe(bp);
  });

  it.each(["", "100.01", "12.555", "-5", "abc", "1,5"])(
    "refuses %j",
    (text) => {
      expect(parsePercent(text)).toBeNull();
    },
  );
});
