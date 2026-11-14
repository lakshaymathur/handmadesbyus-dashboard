import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { db } from "@/db/client";
import {
  categories,
  customisationOptionCategories,
  customers,
  customisationOptions,
  listItems,
  orderItems,
  orders,
  productionStages,
  productCustomisationOptions,
  productPhotos,
  products,
} from "@/db/schema";
import { signInTestUser, signOutTestUser } from "@/db/test/session";
import { GET as servePhoto } from "@/app/api/photos/[id]/route";
import { getStorage } from "@/lib/storage";
import {
  createProduct,
  deleteProduct,
  deleteProductPhoto,
  makeMainPhoto,
  setProductArchived,
  updateProduct,
  uploadProductPhoto,
} from "./actions";
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

describe("options Settings no longer offers for the category", () => {
  async function unlinkLatkanFromBox() {
    await db
      .delete(customisationOptionCategories)
      .where(eq(customisationOptionCategories.optionId, ids.latkan));
  }

  it("can stay on a product, or be removed, but not newly added", async () => {
    const id = await add(); // offers Latkan and Sticker
    await unlinkLatkanFromBox();
    // Saving unchanged still works: Latkan stays.
    await redirectTarget(updateProduct({ ...input({ price: "1,300" }), id }));
    expect((await getProduct(id))?.options.map((o) => o.name)).toEqual([
      "Latkan",
      "Sticker",
    ]);
    // Unticking it works too.
    await redirectTarget(
      updateProduct({ ...input({ optionIds: [ids.sticker] }), id }),
    );
    expect((await getProduct(id))?.options.map((o) => o.name)).toEqual([
      "Sticker",
    ]);
    // But it can't be added back, or onto another product.
    expect(
      await updateProduct({
        ...input({ optionIds: [ids.latkan, ids.sticker] }),
        id,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { optionIds: expect.any(Array) },
    });
    expect(
      await createProduct(input({ sku: "NEW-1", optionIds: [ids.latkan] })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { optionIds: expect.any(Array) },
    });
  });

  it("aren't kept when the product moves to another category", async () => {
    const id = await add();
    await unlinkLatkanFromBox();
    expect(
      await updateProduct({
        ...input({ categoryId: ids.pouch, optionIds: [ids.latkan] }),
        id,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { optionIds: expect.any(Array) },
    });
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
    expect(
      (await getProducts({ status: "all" })).map((p) => [p.name, p.archived]),
    ).toEqual([
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

describe("photos", () => {
  // Tables are wiped between tests, stored files aren't: delete what the test stored.
  afterEach(async () => {
    const rows = await db
      .select({ key: productPhotos.storageKey })
      .from(productPhotos);
    await Promise.all(rows.map((r) => getStorage().delete(r.key)));
  });

  /** A file whose first bytes say JPEG (the server reads the type, not the name). */
  const jpeg = (label: string) =>
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), label], "x.jpg", {
      type: "image/jpeg",
    });

  async function upload(productId: string, label: string) {
    return uploadProductPhoto({ productId, photo: jpeg(label) });
  }

  const order = async (productId: string) =>
    (
      await db
        .select({
          key: productPhotos.storageKey,
          position: productPhotos.position,
        })
        .from(productPhotos)
        .where(eq(productPhotos.productId, productId))
        .orderBy(productPhotos.position)
    ).map((p) => p.position);

  /** Requests a photo URL from the app's photo route, as an <img> would. */
  function get(url: string) {
    const id = url.replace("/api/photos/", "");
    return servePhoto(new Request(`http://localhost:3000${url}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("stores photos in order, serves them through the app, and makes the first the thumbnail", async () => {
    const id = await add();
    expect(await upload(id, "first")).toEqual({ ok: true, data: undefined });
    await upload(id, "second");
    const product = await getProduct(id);
    expect(product?.photos).toHaveLength(2);
    const url = product?.photos[0]?.url ?? "";
    expect(url).toMatch(/^\/api\/photos\/[0-9a-f-]{36}$/);
    const response = await get(url);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    });
    expect(await response.text()).toContain("first");
    const [listed] = await getProducts();
    expect(listed?.thumbnailUrl).toBe(url);
  });

  it("serves photos only to signed-in users, and 404s anything else", async () => {
    const id = await add();
    await upload(id, "private");
    const url = (await getProduct(id))?.photos[0]?.url ?? "";
    expect((await get("/api/photos/not-a-uuid")).status).toBe(404);
    expect(
      (await get("/api/photos/00000000-0000-4000-8000-000000000000")).status,
    ).toBe(404);
    signOutTestUser();
    await expect(get(url)).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });

  it("serves a file by its real type and refuses non-images", async () => {
    const id = await add();
    const svg = new File(["<svg onload=alert(1)>"], "photo.jpg", {
      type: "image/jpeg",
    });
    expect(await uploadProductPhoto({ productId: id, photo: svg })).toEqual({
      ok: false,
      error: "That isn't a photo we can use. Use JPEG, PNG or WebP.",
      fieldErrors: { photo: ["Use a JPEG, PNG or WebP photo"] },
    });
    expect(await db.$count(productPhotos)).toBe(0);
  });

  it("allows 5, and removes the stored file when a 6th is refused", async () => {
    const id = await add();
    for (let i = 0; i < 5; i++) await upload(id, `p${i}`);
    const put = vi.spyOn(getStorage(), "put");
    expect(await upload(id, "too many")).toEqual({
      ok: false,
      error: "A product can have 5 photos. Delete one first.",
    });
    const refusedKey = put.mock.calls[0]?.[0] ?? "";
    put.mockRestore();
    expect(refusedKey).toMatch(new RegExp(`^products/${id}/.+\\.jpg$`));
    expect(await getStorage().exists(refusedKey)).toBe(false);
    expect(await order(id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps the limit when photos are added at the same time", async () => {
    const id = await add();
    for (let i = 0; i < 3; i++) await upload(id, `p${i}`);
    const results = await Promise.all(
      [0, 1, 2, 3].map((i) => upload(id, `race${i}`)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await order(id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("makes another photo the main one, keeping the rest in order", async () => {
    const id = await add();
    for (const label of ["a", "b", "c"]) await upload(id, label);
    const photos = (await getProduct(id))?.photos ?? [];
    await makeMainPhoto({ id: photos[2]?.id ?? "" });
    const after = (await getProduct(id))?.photos.map((p) => p.id);
    expect(after).toEqual([photos[2]?.id, photos[0]?.id, photos[1]?.id]);
  });

  it("deletes a photo and its file, closing up the gap", async () => {
    const id = await add();
    for (const label of ["a", "b", "c"]) await upload(id, label);
    const [first] = await db
      .select()
      .from(productPhotos)
      .where(eq(productPhotos.position, 0));
    expect(await deleteProductPhoto({ id: first?.id ?? "" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await order(id)).toEqual([0, 1]);
    expect(await getStorage().exists(first?.storageKey ?? "")).toBe(false);
  });

  it("refuses photos for a product that doesn't exist, without keeping the file", async () => {
    const put = vi.spyOn(getStorage(), "put");
    expect(
      await upload("00000000-0000-4000-8000-000000000000", "orphan"),
    ).toEqual({
      ok: false,
      error: "That product no longer exists. Reload the page.",
    });
    const key = put.mock.calls[0]?.[0] ?? "";
    put.mockRestore();
    expect(await getStorage().exists(key)).toBe(false);
  });
});

describe("filtering", () => {
  it("narrows by category, type, colour and status", async () => {
    await add(); // Box, Square, Red
    await add({
      sku: "POUCH-1",
      name: "Plain Pouch",
      categoryId: ids.pouch,
      typeId: "",
      colourId: "",
      optionIds: [],
    });
    const old = await add({ sku: "OLD-1", name: "Old Box" });
    await setProductArchived({ id: old, archived: true });

    const names = async (filters: Parameters<typeof getProducts>[0]) =>
      (await getProducts(filters)).map((p) => p.name);
    expect((await getProducts()).map((p) => p.name)).toEqual([
      "Plain Pouch",
      "Square Box – Red Floral",
    ]); // active only unless asked
    expect(await names({ status: "active" })).toEqual([
      "Plain Pouch",
      "Square Box – Red Floral",
    ]);
    expect(await names({ status: "archived" })).toEqual(["Old Box"]);
    expect(await names({ status: "all", categoryId: ids.box })).toEqual([
      "Square Box – Red Floral",
      "Old Box",
    ]);
    expect(
      await names({ status: "active", typeId: ids.square, colourId: ids.red }),
    ).toEqual(["Square Box – Red Floral"]);
    expect(await names({ status: "active", colourId: ids.floral })).toEqual([]);
  });
});

describe("deleting", () => {
  /** Puts the product on an order (the minimum the database needs). */
  async function order(productId: string) {
    const { userId } = await signInTestUser();
    const by = { createdBy: userId, updatedBy: userId };
    const [stage] = await db
      .insert(productionStages)
      .values({ categoryId: ids.box, name: "Not started", position: 0, ...by })
      .returning();
    const [customer] = await db
      .insert(customers)
      .values({ number: 1, firstName: "Asha", mobile: "9810000001", ...by })
      .returning();
    const [row] = await db
      .insert(orders)
      .values({
        code: "HMU-2611-0001",
        customerId: customer?.id ?? "",
        orderDate: "2026-11-14",
        promisedDate: "2026-11-20",
        deliveryLine1: "1",
        deliveryCity: "Jaipur",
        deliveryState: "Rajasthan",
        deliveryPin: "302001",
        ...by,
      })
      .returning();
    await db.insert(orderItems).values({
      orderId: row?.id ?? "",
      productId,
      categoryId: ids.box,
      productionStageId: stage?.id ?? "",
      unitPrice: 120_000,
      unitCost: 45_000,
      ...by,
    });
  }

  it("deletes a product never ordered, with its photos and their files", async () => {
    const id = await add();
    await uploadProductPhoto({
      productId: id,
      photo: new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "a.jpg"),
    });
    const [photo] = await db.select().from(productPhotos);
    expect((await getProduct(id))?.usedInOrders).toBe(false);
    expect(await redirectTarget(deleteProduct({ id }))).toBe("/products");
    expect(await db.$count(products)).toBe(0);
    expect(await db.$count(productPhotos)).toBe(0);
    expect(await db.$count(productCustomisationOptions)).toBe(0);
    expect(await getStorage().exists(photo?.storageKey ?? "")).toBe(false);
  });

  it("refuses a product that's on an order: archive it instead", async () => {
    const id = await add();
    await order(id);
    expect((await getProduct(id))?.usedInOrders).toBe(true);
    expect(await deleteProduct({ id })).toEqual({
      ok: false,
      error:
        "This product is on orders, so it can't be deleted. Archive it instead.",
    });
    expect(await db.$count(products)).toBe(1);
  });
});
