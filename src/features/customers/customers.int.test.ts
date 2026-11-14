import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { db } from "@/db/client";
import { customerAddresses, customers, idCounters } from "@/db/schema";
import { signInTestUser, signOutTestUser } from "@/db/test/session";
import {
  addAddress,
  checkCustomerDuplicates,
  createCustomer,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
  updateCustomer,
} from "./actions";
import { getCustomer, searchCustomers } from "./queries";
import type { CreateCustomerInput, CustomerInput } from "./schema";

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

/** Where an action redirected to (it throws Next's redirect), e.g. "/customers/…". */
async function redirectTarget(action: Promise<unknown>): Promise<string> {
  const error: unknown = await action.then(
    (result) => {
      throw new Error(`Expected a redirect, got ${JSON.stringify(result)}`);
    },
    (e: unknown) => e,
  );
  const target = /;(\/[^;]+);/.exec(
    (error as { digest?: string }).digest ?? "",
  )?.[1];
  if (!target) throw error;
  return target;
}

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

  it("doesn't blame a duplicate for other clashes (e.g. a counter behind the table)", async () => {
    await add(ANANYA);
    await db
      .update(idCounters)
      .set({ lastValue: 0 })
      .where(eq(idCounters.name, "customer"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(await createCustomer(ROHIT)).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    expect(consoleError).toHaveBeenCalled(); // logged, so someone can see why
    consoleError.mockRestore();
  });

  it("refuses a post link as a handle", async () => {
    expect(
      await createCustomer({
        ...ANANYA,
        instagramHandle: "https://www.instagram.com/p/C7xYz12/",
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        instagramHandle: [expect.stringMatching(/link to a post/)],
      },
    });
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
    ["+91 98100", ["Ananya Sharma"]], // partial, typed with the country code
    ["instagram.com/p/C7xYz12", []], // a post link matches no handle
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

const ADDRESS = {
  line1: "7, Lake View",
  line2: "",
  landmark: "Opp. Cubbon Park",
  city: "Bengaluru",
  state: "Karnataka",
  pin: "560001",
} as const;

/** The customer's own fields from a create input (no address). */
const customerFields = (c: CreateCustomerInput): CustomerInput => ({
  mobile: c.mobile,
  instagramHandle: c.instagramHandle,
  firstName: c.firstName,
  lastName: c.lastName,
  source: c.source,
  altMobile: c.altMobile,
  email: c.email,
  notes: c.notes,
});

describe("editing a customer", () => {
  it("saves their details and goes back to their page", async () => {
    const id = await add(ANANYA);
    expect(
      await redirectTarget(
        updateCustomer({
          ...customerFields(ANANYA),
          id,
          mobile: "98100 00001", // their own number: not a duplicate
          lastName: "",
          email: " ananya@example.com ",
        }),
      ),
    ).toBe(`/customers/${id}`);
    expect(await getCustomer(id)).toMatchObject({
      code: "C-0001",
      name: "Ananya",
      email: "ananya@example.com",
      addresses: [expect.objectContaining({ city: "Jaipur" })],
    });
  });

  it("refuses someone else's mobile or handle", async () => {
    const ananya = await add(ANANYA);
    const rohit = await add(ROHIT);
    expect(
      await updateCustomer({
        ...customerFields(ROHIT),
        id: rohit,
        mobile: "9810000001",
      }),
    ).toEqual({
      ok: false,
      error: "This customer may already exist.",
      fieldErrors: { mobile: ["Already used by C-0001 Ananya Sharma"] },
    });
    expect(
      await checkCustomerDuplicates({
        mobile: "9810000001",
        instagramHandle: "",
        excludeId: ananya,
      }),
    ).toEqual({ ok: true, data: {} });
  });

  it("keeps a missing source unset (never guesses one)", async () => {
    const id = await add(ANANYA);
    await db
      .update(customers)
      .set({ source: null })
      .where(eq(customers.id, id));
    await redirectTarget(
      updateCustomer({ ...customerFields(ANANYA), id, source: "", notes: "x" }),
    );
    expect(await getCustomer(id)).toMatchObject({ source: null, notes: "x" });
    // Adding still needs one.
    expect(await createCustomer({ ...ROHIT, source: "" })).toMatchObject({
      ok: false,
      fieldErrors: { source: ["Choose where they came from"] },
    });
  });

  it("says so if the customer is gone", async () => {
    expect(
      await updateCustomer({
        ...customerFields(ANANYA),
        id: "00000000-0000-4000-8000-000000000000",
      }),
    ).toEqual({
      ok: false,
      error: "That customer no longer exists. Reload the page.",
    });
  });
});

describe("addresses", () => {
  let customerId: string;
  beforeEach(async () => {
    customerId = await add(ANANYA);
  });

  const addresses = async () =>
    (await getCustomer(customerId))?.addresses.map((a) => [
      a.city,
      a.isDefault,
    ]);

  async function addressId(city: string): Promise<string> {
    const found = (await getCustomer(customerId))?.addresses.find(
      (a) => a.city === city,
    );
    if (!found) throw new Error(`No address in ${city}`);
    return found.id;
  }

  async function addAnother(makeDefault: boolean, city: string = ADDRESS.city) {
    expect(
      await redirectTarget(
        addAddress({ customerId, ...ADDRESS, city, makeDefault }),
      ),
    ).toBe(`/customers/${customerId}`);
    return addressId(city);
  }

  it("adds one, as the default only when asked", async () => {
    await addAnother(false);
    expect(await addresses()).toEqual([
      ["Jaipur", true],
      ["Bengaluru", false],
    ]);
    await addAnother(true, "Mysuru");
    expect(await addresses()).toEqual([
      ["Mysuru", true],
      ["Jaipur", false],
      ["Bengaluru", false],
    ]);
  });

  it("changes one", async () => {
    const id = await addAnother(false);
    expect(
      await redirectTarget(
        updateAddress({ id, ...ADDRESS, city: "Mysuru", pin: "570 001" }),
      ),
    ).toBe(`/customers/${customerId}`);
    expect(
      (await getCustomer(customerId))?.addresses.find((a) => a.id === id),
    ).toMatchObject({
      city: "Mysuru",
      pin: "570001",
      landmark: "Opp. Cubbon Park",
    });
  });

  it("switches the default", async () => {
    const id = await addAnother(false);
    expect(await setDefaultAddress({ id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await addresses()).toEqual([
      ["Bengaluru", true],
      ["Jaipur", false],
    ]);
  });

  it("keeps exactly one default when two are chosen at once", async () => {
    const a = await addAnother(false);
    const b = await addAnother(false, "Mysuru");
    const results = await Promise.all([
      setDefaultAddress({ id: a }),
      setDefaultAddress({ id: b }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(
      (await addresses())?.filter(([, isDefault]) => isDefault),
    ).toHaveLength(1);
  });

  it("deletes one; deleting the default promotes the oldest other", async () => {
    const first = await addressId("Jaipur");
    await addAnother(false);
    await addAnother(false, "Mysuru");
    expect(await deleteAddress({ id: first })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await addresses()).toEqual([
      ["Bengaluru", true],
      ["Mysuru", false],
    ]);
  });

  it("won't delete the only address", async () => {
    expect(await deleteAddress({ id: await addressId("Jaipur") })).toEqual({
      ok: false,
      error: "A customer needs at least one address. Add another one first.",
    });
    expect(await addresses()).toEqual([["Jaipur", true]]);
  });

  it("says so if the address is gone", async () => {
    expect(
      await setDefaultAddress({ id: "00000000-0000-4000-8000-000000000000" }),
    ).toEqual({
      ok: false,
      error: "That address no longer exists. Reload the page.",
    });
  });
});
