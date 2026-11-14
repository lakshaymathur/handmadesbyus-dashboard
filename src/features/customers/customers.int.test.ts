import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);

import { db } from "@/db/client";
import { customerAddresses, customers } from "@/db/schema";
import { signInTestUser, signOutTestUser } from "@/db/test/session";
import { checkCustomerDuplicates, createCustomer } from "./actions";
import { getCustomer, searchCustomers } from "./queries";
import type { CreateCustomerInput } from "./schema";

const ANANYA: CreateCustomerInput = {
  mobile: "+91 98100 00001",
  instagramHandle: "@Ananya.Creates",
  firstName: "Ananya",
  lastName: "Sharma",
  source: "instagram",
  altMobile: "",
  email: "",
  notes: "Prefers pastel colours",
  line1: "12, Rose Apartments",
  line2: "MG Road",
  landmark: "",
  city: "Jaipur",
  state: "Rajasthan",
  pin: "302001",
};

const ROHIT: CreateCustomerInput = {
  ...ANANYA,
  mobile: "9820000002",
  altMobile: "9820099999",
  instagramHandle: "",
  firstName: "Rohit",
  lastName: "",
  source: "whatsapp",
  notes: "",
  city: "Pune",
  state: "Maharashtra",
  pin: "411001",
};

/** Adds a customer and returns the id from the redirect to their page. */
async function add(input: CreateCustomerInput): Promise<string> {
  const error: unknown = await createCustomer(input).then(
    (result) => {
      throw new Error(`Expected a redirect, got ${JSON.stringify(result)}`);
    },
    (e: unknown) => e,
  );
  const digest = (error as { digest?: string }).digest ?? "";
  const id = /\/customers\/([0-9a-f-]{36})/.exec(digest)?.[1];
  if (!id) throw error;
  return id;
}

let userId: string;

beforeEach(async () => {
  ({ userId } = await signInTestUser());
});

describe("adding a customer", () => {
  it("saves them with a C- number and their first address as default", async () => {
    const id = await add(ANANYA);
    expect(await getCustomer(id)).toMatchObject({
      code: "C-0001",
      name: "Ananya Sharma",
      mobile: "9810000001",
      instagramHandle: "ananya.creates",
      source: "instagram",
      notes: "Prefers pastel colours",
      altMobile: null,
      addresses: [
        {
          line1: "12, Rose Apartments",
          line2: "MG Road",
          landmark: null,
          city: "Jaipur",
          state: "Rajasthan",
          pin: "302001",
          isDefault: true,
        },
      ],
    });
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    expect(row).toMatchObject({ createdBy: userId, updatedBy: userId });
    expect((await getCustomer(await add(ROHIT)))?.code).toBe("C-0002");
  });

  it("refuses a mobile or handle someone already has, naming them", async () => {
    await add(ANANYA);
    expect(
      await createCustomer({
        ...ROHIT,
        mobile: "098100 00001",
        instagramHandle: "https://instagram.com/ANANYA.CREATES",
      }),
    ).toEqual({
      ok: false,
      error: "This customer may already exist.",
      fieldErrors: {
        mobile: ["Already used by C-0001 Ananya Sharma"],
        instagramHandle: ["Already used by C-0001 Ananya Sharma"],
      },
    });
    // Nothing half-saved, and the number wasn't used up.
    expect(await db.$count(customers)).toBe(1);
    expect(await db.$count(customerAddresses)).toBe(1);
    expect((await getCustomer(await add(ROHIT)))?.code).toBe("C-0002");
  });

  it("lets only one of two simultaneous saves of the same mobile through", async () => {
    const results = await Promise.allSettled([
      createCustomer(ANANYA),
      createCustomer({ ...ANANYA, instagramHandle: "" }),
    ]);
    // One redirects (rejects with NEXT_REDIRECT), the other gets the field error.
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(results.find((r) => r.status === "fulfilled")?.value).toMatchObject({
      ok: false,
      fieldErrors: { mobile: ["Already used by C-0001 Ananya Sharma"] },
    });
    expect(await db.$count(customers)).toBe(1);
  });

  it("validates on the server too", async () => {
    expect(
      await createCustomer({ ...ANANYA, mobile: "123", pin: "1" }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { mobile: expect.any(Array), pin: expect.any(Array) },
    });
  });

  it("needs a signed-in user", async () => {
    signOutTestUser();
    await expect(createCustomer(ANANYA)).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
    expect(await db.$count(customers)).toBe(0);
  });
});

describe("the live duplicate check", () => {
  it("names who has the mobile or handle, ignoring half-typed values", async () => {
    const id = await add(ANANYA);
    const ananya = { id, code: "C-0001", name: "Ananya Sharma" };
    expect(
      await checkCustomerDuplicates({
        mobile: "98100 00001",
        instagramHandle: "@ananya.creates",
      }),
    ).toEqual({ ok: true, data: { mobile: ananya, instagramHandle: ananya } });
    expect(
      await checkCustomerDuplicates({ mobile: "98100", instagramHandle: "" }),
    ).toEqual({ ok: true, data: {} });
  });
});

describe("searching", () => {
  beforeEach(async () => {
    await add(ANANYA);
    await add(ROHIT);
  });

  const search = async (q: string) =>
    (await searchCustomers(q)).customers.map((c) => c.name);

  it("lists everyone newest first, with their default city", async () => {
    expect(await searchCustomers("")).toEqual({
      customers: [
        expect.objectContaining({
          code: "C-0002",
          name: "Rohit",
          city: "Pune",
        }),
        expect.objectContaining({ code: "C-0001", name: "Ananya Sharma" }),
      ],
      more: false,
    });
  });

  it.each([
    ["C-0002", ["Rohit"]],
    ["c1", ["Ananya Sharma"]],
    ["98100", ["Ananya Sharma"]],
    ["+91 98200 00002", ["Rohit"]],
    ["99999", ["Rohit"]], // alternate mobile
    ["ana sha", ["Ananya Sharma"]],
    ["SHARMA", ["Ananya Sharma"]],
    ["@ananya.cr", ["Ananya Sharma"]],
    ["creates", ["Ananya Sharma"]],
    ["%", []],
    ["nobody", []],
  ])("%s finds %j", async (q, expected) => {
    expect(await search(q)).toEqual(expected);
  });
});
