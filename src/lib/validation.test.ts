import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toFormErrors } from "./validation";

const schema = z
  .object({
    name: z.string().min(2, "Too short"),
    items: z.array(z.object({ qty: z.number().min(1, "At least 1") })),
    discount: z.number(),
    subtotal: z.number(),
  })
  .refine(
    (o) => o.discount <= o.subtotal,
    "Discount can't exceed the subtotal",
  );

describe("toFormErrors", () => {
  it("keys nested field errors by their full path", () => {
    const result = schema.safeParse({
      name: "x",
      items: [{ qty: 2 }, { qty: 0 }],
      discount: 0,
      subtotal: 10,
    });
    expect(toFormErrors(result.error!)).toEqual({
      formErrors: [],
      fieldErrors: { name: ["Too short"], "items.1.qty": ["At least 1"] },
    });
  });

  it("keeps whole-form errors from an object-level refine", () => {
    const result = schema.safeParse({
      name: "Ravi",
      items: [],
      discount: 50,
      subtotal: 10,
    });
    expect(toFormErrors(result.error!)).toEqual({
      formErrors: ["Discount can't exceed the subtotal"],
      fieldErrors: {},
    });
  });

  it("collects several messages for one field", () => {
    const multi = z.object({
      code: z.string().min(3, "Too short").regex(/^\d+$/, "Digits only"),
    });
    const result = multi.safeParse({ code: "a" });
    expect(toFormErrors(result.error!).fieldErrors.code).toEqual([
      "Too short",
      "Digits only",
    ]);
  });
});
