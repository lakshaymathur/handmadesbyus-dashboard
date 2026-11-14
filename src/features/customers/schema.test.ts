import { describe, expect, it } from "vitest";
import { customerName, formatAddress, formatMobile } from "./format";
import {
  createCustomerSchema,
  mobileSearchDigits,
  normalizeInstagramHandle,
  normalizeMobile,
  type CreateCustomerInput,
} from "./schema";

describe("normalizeMobile", () => {
  it.each([
    ["9810000001", "9810000001"],
    ["+91 98100 00001", "9810000001"],
    ["91-98100-00001", "9810000001"],
    ["098100 00001", "9810000001"],
    ["(981) 000-0001", "9810000001"],
  ])("%s → %s", (input, output) => {
    expect(normalizeMobile(input)).toBe(output);
  });

  it("leaves other lengths alone for the validator to reject", () => {
    expect(normalizeMobile("98100")).toBe("98100");
    expect(normalizeMobile("+1 415 555 0100")).toBe("14155550100");
  });
});

describe("normalizeInstagramHandle", () => {
  it.each([
    ["ananya.creates", "ananya.creates"],
    ["@Ananya.Creates", "ananya.creates"],
    ["  @fatima_gifts ", "fatima_gifts"],
    ["https://www.instagram.com/Ananya.Creates/?hl=en", "ananya.creates"],
    ["instagram.com/fatima_gifts", "fatima_gifts"],
    ["", ""],
    ["https://instagram.com/stories/Fatima_Gifts/3141592653/", "fatima_gifts"],
    ["m.instagram.com/ananya.creates", "ananya.creates"],
  ])("%s → %s", (input, output) => {
    expect(normalizeInstagramHandle(input)).toBe(output);
  });

  it.each([
    "https://www.instagram.com/p/C7xYz12/",
    "https://www.instagram.com/reel/C7xYz12/?igsh=abc",
    "instagram.com/explore/tags/potli",
    "https://instagram.com/",
  ])("%s isn't a profile: null", (input) => {
    expect(normalizeInstagramHandle(input)).toBeNull();
  });

  it("explains why a post link is refused", () => {
    const result = createCustomerSchema.shape.instagramHandle.safeParse(
      "https://www.instagram.com/p/C7xYz12/",
    );
    expect(result.error?.issues[0]?.message).toMatch(/link to a post/);
  });
});

describe("mobileSearchDigits", () => {
  it.each([
    ["98100", "98100"],
    ["+91 98100", "98100"],
    ["+9198100", "98100"],
    ["91 98100", "98100"],
    ["919810000001", "9810000001"],
    ["098100", "98100"],
    ["9100", "9100"], // just digits that happen to start with 91
    ["(981) 000", "981000"],
  ])("%s → %s", (input, output) => {
    expect(mobileSearchDigits(input)).toBe(output);
  });
});

const valid: CreateCustomerInput = {
  mobile: "+91 98100 00001",
  instagramHandle: "@Ananya.Creates",
  firstName: "  Ananya ",
  lastName: "",
  source: "instagram",
  altMobile: "",
  email: "",
  notes: "",
  line1: "12, Rose Apartments",
  line2: "",
  landmark: "",
  city: "Jaipur",
  state: "Rajasthan",
  pin: "302 001",
};

describe("createCustomerSchema", () => {
  it("normalises input and turns empty optional fields into null", () => {
    expect(createCustomerSchema.parse(valid)).toEqual({
      mobile: "9810000001",
      instagramHandle: "ananya.creates",
      firstName: "Ananya",
      lastName: null,
      source: "instagram",
      altMobile: null,
      email: null,
      notes: null,
      line1: "12, Rose Apartments",
      line2: null,
      landmark: null,
      city: "Jaipur",
      state: "Rajasthan",
      pin: "302001",
    });
  });

  it("rejects what the database would", () => {
    const result = createCustomerSchema.safeParse({
      ...valid,
      mobile: "98100",
      instagramHandle: "not a handle!",
      firstName: " ",
      altMobile: "123",
      email: "nope",
      city: "",
      state: "Atlantis",
      pin: "012345",
      line1: " ",
    });
    expect(result.success).toBe(false);
    expect(
      Object.keys(result.error?.flatten().fieldErrors ?? {}).sort(),
    ).toEqual([
      "altMobile",
      "city",
      "email",
      "firstName",
      "instagramHandle",
      "line1",
      "mobile",
      "pin",
      "state",
    ]);
  });
});

describe("format", () => {
  it("writes mobiles as 5 + 5 digits", () => {
    expect(formatMobile("9810000001")).toBe("98100 00001");
    expect(formatMobile("123")).toBe("123");
  });

  it("joins names and addresses, skipping what's missing", () => {
    expect(customerName({ firstName: "Rohit", lastName: null })).toBe("Rohit");
    expect(customerName({ firstName: "Fatima", lastName: "Khan" })).toBe(
      "Fatima Khan",
    );
    expect(
      formatAddress({
        line1: "12, Rose Apartments",
        line2: null,
        landmark: "Near City Palace",
        city: "Jaipur",
        state: "Rajasthan",
        pin: "302001",
      }),
    ).toBe("12, Rose Apartments, Near City Palace, Jaipur, Rajasthan 302001");
  });
});
