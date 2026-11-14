import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { db } from "@/db/client";
import {
  categories,
  customisationOptionCategories,
  customisationOptions,
  listItems,
  productCustomisationOptions,
  products,
} from "@/db/schema";
import { signInTestUser, signOutTestUser } from "@/db/test/session";
import { createProduct, setProductArchived, updateProduct } from "./actions";
import { getProduct, getProductFormChoices, getProducts } from "./queries";
import type { ProductInput } from "./schema";

/** Where an action redirected to (it throws Next's redirect). */
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

let ids: {
  box: string;
  pouch: string;
  red: string;
  floral: string;
  square: string;
  latkan: string;
  sticker: string;
};

beforeEach(async () => {
  const { userId } = await signInTestUser();
  const by = { createdBy: userId, updatedBy: userId };
  const [box, pouch] = await db
    .insert(categories)
    .values([
      { name: "Box", sortOrder: 0, ...by },
      { name: "Pouch", sortOrder: 1, ...by },
    ])
    .returning();
  const items = await db
    .insert(listItems)
    .values([
      { kind: "colour", name: "Red", sortOrder: 0, ...by },
      { kind: "design", name: "Floral", sortOrder: 0, ...by },
      { kind: "product_type", name: "Square", sortOrder: 0, ...by },
    ])
    .returning();
  const [latkan, sticker] = await db
    .insert(customisationOptions)
    .values([
      {
        name: "Latkan",
        inputType: "none",
        sortOrder: 0,
        extraPrice: 5_000,
        extraCost: 1_000,
        ...by,
      },
      {
        name: "Sticker",
        inputType: "text",
        maxLength: 20,
        sortOrder: 1,
        extraPrice: 3_000,
        extraCost: 500,
        ...by,
      },
    ])
    .returning();
  if (!box || !pouch || !latkan || !sticker) throw new Error("setup failed");
  await db.insert(customisationOptionCategories).values([
    { optionId: latkan.id, categoryId: box.id, ...by },
    { optionId: sticker.id, categoryId: box.id, ...by },
    { optionId: sticker.id, categoryId: pouch.id, ...by },
  ]);
  const item = (name: string) => items.find((i) => i.name === name)?.id ?? "";
  ids = {
    box: box.id,
    pouch: pouch.id,
    red: item("Red"),
    floral: item("Floral"),
    square: item("Square"),
    latkan: latkan.id,
    sticker: sticker.id,
  };
});

const input = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  sku: "box-sq-red-01",
  name: "Square Box – Red Floral",
  categoryId: ids.box,
  typeId: ids.square,
  colourId: ids.red,
  designId: ids.floral,
  length: "20",
  width: "20",
  height: "10.5",
  weight: "350",
  price: "1,200",
  cost: "450",
  optionIds: [ids.latkan, ids.sticker],
  ...overrides,
});

async function add(overrides: Partial<ProductInput> = {}): Promise<string> {
  const target = await redirectTarget(createProduct(input(overrides)));
  const id = /^\/products\/([0-9a-f-]{36})$/.exec(target)?.[1];
  if (!id) throw new Error(`Unexpected redirect ${target}`);
  return id;
}

describe("adding a product", () => {
  it("saves it in stored units with its options, then opens it", async () => {
    const id = await add();
    expect(await getProduct(id)).toMatchObject({
      sku: "BOX-SQ-RED-01",
      name: "Square Box – Red Floral",
      category: "Box",
      type: "Square",
      colour: "Red",
      design: "Floral",
      lengthMm: 200,
      widthMm: 200,
      heightMm: 105,
      weightG: 350,
      price: 120_000,
      cost: 45_000,
      archived: false,
      options: [
        { id: ids.latkan, name: "Latkan" },
        { id: ids.sticker, name: "Sticker" },
      ],
    });
  });

  it("refuses a taken product ID in any case, naming the product", async () => {
    await add();
    expect(
      await createProduct(input({ sku: "Box-Sq-Red-01", name: "Other" })),
    ).toEqual({
      ok: false,
      error: "That product ID is taken.",
      fieldErrors: { sku: ["Already used by “Square Box – Red Floral”"] },
    });
  });

  it("only one of two simultaneous saves of the same ID gets through", async () => {
    const results = await Promise.allSettled([
      createProduct(input()),
      createProduct(input({ sku: "BOX-SQ-RED-01" })),
    ]);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1); // redirect
    expect(results.find((r) => r.status === "fulfilled")?.value).toMatchObject({
      ok: false,
      fieldErrors: { sku: expect.any(Array) },
    });
    expect(await db.$count(products)).toBe(1);
  });

  it("refuses list entries of the wrong kind and options from another category", async () => {
    expect(
      await createProduct(
        input({ colourId: ids.floral, categoryId: ids.pouch }),
      ),
    ).toEqual({
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: {
        colourId: ["That entry no longer exists. Reload the page."],
        optionIds: [
          "Some options don't apply to this category. Reload the page.",
        ],
      },
    });
    expect(await db.$count(products)).toBe(0);
  });

  it("needs a signed-in user", async () => {
    signOutTestUser();
    await expect(createProduct(input())).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });
});

describe("editing a product", () => {
  it("saves changes, keeping its own ID and the options still chosen", async () => {
    const id = await add();
    const [latkanLink] = await db
      .select()
      .from(productCustomisationOptions)
      .where(eq(productCustomisationOptions.optionId, ids.latkan));
    expect(
      await redirectTarget(
        updateProduct({
          ...input({
            sku: "BOX-SQ-RED-01",
            price: "1,350",
            height: "",
            optionIds: [ids.latkan],
          }),
          id,
        }),
      ),
    ).toBe(`/products/${id}`);
    expect(await getProduct(id)).toMatchObject({
      price: 135_000,
      heightMm: null,
      options: [{ id: ids.latkan, name: "Latkan" }],
    });
    // The kept option's row (and its audit) is untouched.
    const [after] = await db
      .select()
      .from(productCustomisationOptions)
      .where(eq(productCustomisationOptions.optionId, ids.latkan));
    expect(after?.createdAt).toEqual(latkanLink?.createdAt);
  });

  it("refuses another product's ID", async () => {
    await add();
    const other = await add({
      sku: "POUCH-01",
      categoryId: ids.pouch,
      optionIds: [],
    });
    expect(
      await updateProduct({
        ...input({
          sku: "box-sq-red-01",
          categoryId: ids.pouch,
          optionIds: [],
        }),
        id: other,
      }),
    ).toMatchObject({ ok: false, fieldErrors: { sku: expect.any(Array) } });
  });
});

describe("archiving", () => {
  it("hides it at the end of the list and can bring it back", async () => {
    const box = await add();
    await add({
      sku: "ZZ-1",
      name: "Zari Pouch",
      categoryId: ids.pouch,
      optionIds: [],
    });
    expect(await setProductArchived({ id: box, archived: true })).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await getProducts()).map((p) => [p.name, p.archived])).toEqual([
      ["Zari Pouch", false],
      ["Square Box – Red Floral", true],
    ]);
    // Archiving again keeps the first date.
    const [first] = await db
      .select()
      .from(products)
      .where(eq(products.id, box));
    await setProductArchived({ id: box, archived: true });
    const [again] = await db
      .select()
      .from(products)
      .where(eq(products.id, box));
    expect(again?.archivedAt).toEqual(first?.archivedAt);

    await setProductArchived({ id: box, archived: false });
    expect((await getProduct(box))?.archived).toBe(false);
  });

  it("says so if the product is gone", async () => {
    expect(
      await setProductArchived({
        id: "00000000-0000-4000-8000-000000000000",
        archived: true,
      }),
    ).toEqual({
      ok: false,
      error: "That product no longer exists. Reload the page.",
    });
  });
});

describe("form choices", () => {
  it("lists each kind separately, and which categories each option fits", async () => {
    const choices = await getProductFormChoices();
    expect(choices.categories.map((c) => c.name)).toEqual(["Box", "Pouch"]);
    expect(choices.colours.map((c) => c.name)).toEqual(["Red"]);
    expect(choices.types.map((c) => c.name)).toEqual(["Square"]);
    expect(choices.options.map((o) => [o.name, o.categoryIds.length])).toEqual([
      ["Latkan", 1],
      ["Sticker", 2],
    ]);
  });
});
