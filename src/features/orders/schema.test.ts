import { describe, expect, it } from "vitest";
import {
  discountOf,
  orderItemSchema,
  orderSchema,
  statusChangeSchema,
  type OrderInput,
} from "./schema";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const valid: OrderInput = {
  customerId: id(1),
  orderDate: "2026-11-14",
  promisedDate: "2026-11-20",
  priority: "normal",
  channel: "",
  line1: "12, Rose Apartments",
  line2: "",
  landmark: "",
  city: "Jaipur",
  state: "Rajasthan",
  pin: "302001",
  discountType: "flat",
  discountValue: "₹ 150",
  shippingCharged: "0",
  notes: "",
  items: [
    {
      productId: id(2),
      quantity: " 3 ",
      unitPrice: "1,200.50",
      notes: "",
      customisations: [],
    },
  ],
};

describe("orderSchema", () => {
  it("turns the form into stored values", () => {
    const parsed = orderSchema.parse(valid);
    expect(parsed).toMatchObject({
      channel: null,
      discount: { type: "flat", paise: 15_000 },
      shippingCharged: 0,
      notes: null,
      items: [{ quantity: 3, unitPrice: 120_050, notes: null }],
    });
    expect(parsed).not.toHaveProperty("discountValue");
  });

  it("reads a percentage discount, and ignores the value when there's none", () => {
    expect(
      orderSchema.parse({
        ...valid,
        discountType: "percent",
        discountValue: "12.5",
      }).discount,
    ).toEqual({ type: "percent", bp: 1_250 });
    expect(
      orderSchema.parse({
        ...valid,
        discountType: "none",
        discountValue: "junk",
      }).discount,
    ).toEqual({ type: "none" });
  });

  it("explains unreadable discounts and promised dates before the order date", () => {
    const flat = orderSchema.safeParse({ ...valid, discountValue: "abc" });
    expect(flat.error?.issues.map((i) => i.path.join("."))).toEqual([
      "discountValue",
    ]);
    const percent = orderSchema.safeParse({
      ...valid,
      discountType: "percent",
      discountValue: "120",
    });
    expect(percent.error?.issues[0]?.message).toMatch(/0 to 100/);
    const early = orderSchema.safeParse({
      ...valid,
      promisedDate: "2026-11-13",
    });
    expect(early.error?.issues[0]).toMatchObject({
      path: ["promisedDate"],
      message: "Can't be before the order date",
    });
  });
});

describe("orderItemSchema", () => {
  it.each(["0", "1000", "1.5", "two", ""])(
    "refuses quantity %j",
    (quantity) => {
      expect(
        orderItemSchema.safeParse({ ...valid.items[0], quantity }).success,
      ).toBe(false);
    },
  );
});

describe("discountOf", () => {
  it("returns null for values it can't read", () => {
    expect(
      discountOf({ discountType: "flat", discountValue: "-5" }),
    ).toBeNull();
    expect(
      discountOf({ discountType: "percent", discountValue: "" }),
    ).toBeNull();
    expect(discountOf({ discountType: "none", discountValue: "" })).toEqual({
      type: "none",
    });
  });
});

describe("statusChangeSchema", () => {
  it("needs a status to be chosen", () => {
    const result = statusChangeSchema.safeParse({
      orderId: id(1),
      to: "",
      note: "",
      deliveredDate: "",
      cancelReason: "",
      refundOwed: false,
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["to"],
      message: "Choose the new status",
    });
  });
});
