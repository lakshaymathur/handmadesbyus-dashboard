import { describe, expect, it } from "vitest";
import {
  customisationOptionSchema,
  nameSchema,
  trackingUrlTemplateSchema,
} from "./schema";

const base = {
  name: "Sticker",
  inputType: "text" as const,
  maxLength: "20",
  extraPrice: "50",
  extraCost: "12.50",
  categoryIds: [],
};

describe("nameSchema", () => {
  it("trims and collapses inner spaces", () => {
    expect(nameSchema.parse("  Dark \t  Red ")).toBe("Dark Red");
  });

  it("rejects blank and over-long names", () => {
    expect(nameSchema.safeParse("   ").success).toBe(false);
    expect(nameSchema.safeParse("x".repeat(61)).success).toBe(false);
  });
});

describe("trackingUrlTemplateSchema", () => {
  it("turns empty into null and keeps a valid template", () => {
    expect(trackingUrlTemplateSchema.parse("  ")).toBeNull();
    expect(trackingUrlTemplateSchema.parse("https://x.in/t/{awb}")).toBe(
      "https://x.in/t/{awb}",
    );
  });

  it.each([
    "https://x.in/track",
    "javascript:alert({awb})",
    "https://x.in/ t/{awb}",
  ])("rejects %s", (value) => {
    expect(trackingUrlTemplateSchema.safeParse(value).success).toBe(false);
  });
});

describe("customisationOptionSchema", () => {
  it("converts money to paise and the max length to a number", () => {
    expect(customisationOptionSchema.parse(base)).toMatchObject({
      extraPrice: 5000,
      extraCost: 1250,
      maxLength: 20,
    });
  });

  it("drops the max length unless the input is text", () => {
    expect(
      customisationOptionSchema.parse({
        ...base,
        inputType: "choice",
        maxLength: "abc",
      }).maxLength,
    ).toBeNull();
  });

  it.each(["", "0", "501", "12.5", "ten"])(
    "rejects a max length of %j for text",
    (maxLength) => {
      const result = customisationOptionSchema.safeParse({
        ...base,
        maxLength,
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["maxLength"]);
    },
  );

  it("rejects negative, malformed and absurd amounts", () => {
    for (const extraPrice of ["-5", "5.555", "1,00,001"]) {
      const result = customisationOptionSchema.safeParse({
        ...base,
        extraPrice,
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["extraPrice"]);
    }
  });

  it("de-duplicates categories", () => {
    const id = "7b2e7c9a-3f1e-4c1a-9b7a-2d4e5f6a7b8c";
    expect(
      customisationOptionSchema.parse({ ...base, categoryIds: [id, id] })
        .categoryIds,
    ).toEqual([id]);
  });
});
