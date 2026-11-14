import { describe, expect, it } from "vitest";
import { margin, productSchema, skuSchema, type ProductInput } from "./schema";

describe("skuSchema", () => {
  it("stores product IDs in capitals", () => {
    expect(skuSchema.parse(" box-sq-red-01 ")).toBe("BOX-SQ-RED-01");
    expect(skuSchema.parse("POUCH/EMR.2")).toBe("POUCH/EMR.2");
  });

  it.each(["", "BOX SQ", "-BOX", "BOX#1", "A".repeat(41)])(
    "rejects %j",
    (sku) => {
      expect(skuSchema.safeParse(sku).success).toBe(false);
    },
  );
});

describe("margin", () => {
  it("is price − cost, and a % of the price to one decimal", () => {
    expect(margin(120_000, 45_000)).toEqual({ paise: 75_000, percent: 62.5 });
    expect(margin(30_000, 10_000)).toEqual({ paise: 20_000, percent: 66.7 });
    expect(margin(10_000, 12_000)).toEqual({ paise: -2_000, percent: -20 });
    expect(margin(0, 500)).toEqual({ paise: -500, percent: null });
  });
});

const valid: ProductInput = {
  sku: "box-sq-red-01",
  name: "  Square Box  – Red ",
  categoryId: "00000000-0000-4000-8000-000000000001",
  typeId: "",
  colourId: "00000000-0000-4000-8000-000000000002",
  designId: "",
  length: "20",
  width: "20",
  height: "",
  weight: "350",
  price: "1,200",
  cost: "450.50",
  optionIds: [],
};

describe("productSchema", () => {
  it("converts what's typed into stored units", () => {
    expect(productSchema.parse(valid)).toEqual({
      sku: "BOX-SQ-RED-01",
      name: "Square Box – Red",
      categoryId: "00000000-0000-4000-8000-000000000001",
      typeId: null,
      colourId: "00000000-0000-4000-8000-000000000002",
      designId: null,
      length: 200,
      width: 200,
      height: null,
      weight: 350,
      price: 120_000,
      cost: 45_050,
      optionIds: [],
    });
  });

  it("needs a category and caps prices", () => {
    const result = productSchema.safeParse({
      ...valid,
      categoryId: "",
      price: "10,00,001",
      cost: "",
    });
    expect(
      Object.keys(result.error?.flatten().fieldErrors ?? {}).sort(),
    ).toEqual(["categoryId", "cost", "price"]);
  });
});
