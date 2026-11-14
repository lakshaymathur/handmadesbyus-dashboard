import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { db } from "@/db/client";
import { seedSampleData } from "@/db/sample-data";
import {
  customers,
  customisationChoices,
  customisationOptions,
  orderItemCustomisations,
  orderItems,
  orders,
  productionStages,
  products,
  statusHistory,
} from "@/db/schema";
import { signInTestUser, signOutTestUser } from "@/db/test/session";
import {
  createCustomerInline,
  findCustomers,
  getCustomerForPicker,
} from "@/features/customers/actions";
import {
  changeItemStages,
  changeStatus,
  createOrder,
  updateOrder,
} from "./actions";
import { getOrder, getOrders } from "./queries";
import { getOrderCatalogue } from "@/features/products/queries";
import type { OrderInput, OrderItemInput } from "./schema";
import { duplicateToInput, orderToInput } from "./to-input";

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

let userId: string;
let ids: {
  customer: string;
  squareBox: string;
  pouch: string;
  latkan: string;
  gold: string;
  sticker: string;
  boxFirstStage: string;
};

beforeEach(async () => {
  ({ userId } = await signInTestUser());
  await seedSampleData(db, userId);
  const id = async <T extends { id: string }>(rows: Promise<T[]>) =>
    (await rows)[0]?.id ?? "";
  const product = (sku: string) =>
    id(
      db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.sku, sku)),
    );
  const option = (name: string) =>
    id(
      db
        .select({ id: customisationOptions.id })
        .from(customisationOptions)
        .where(eq(customisationOptions.name, name)),
    );
  const latkan = await option("Latkan");
  ids = {
    customer: await id(
      db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.mobile, "9810000001")),
    ),
    squareBox: await product("BOX-SQ-RED-01"),
    pouch: await product("POUCH-EMR-01"),
    latkan,
    gold: await id(
      db
        .select({ id: customisationChoices.id })
        .from(customisationChoices)
        .where(eq(customisationChoices.name, "Gold")),
    ),
    sticker: await option("Sticker"),
    boxFirstStage: await id(
      db
        .select({ id: productionStages.id })
        .from(productionStages)
        .where(eq(productionStages.name, "Not started"))
        .orderBy(productionStages.position),
    ),
  };
});

const boxItem = (overrides: Partial<OrderItemInput> = {}): OrderItemInput => ({
  productId: ids.squareBox,
  quantity: "2",
  unitPrice: "1,200",
  notes: "Lining in gold",
  customisations: [
    { optionId: ids.latkan, choiceId: ids.gold, text: null },
    { optionId: ids.sticker, choiceId: null, text: " Happy Birthday " },
  ],
  ...overrides,
});

const order = (overrides: Partial<OrderInput> = {}): OrderInput => ({
  customerId: ids.customer,
  orderDate: "2026-11-14",
  promisedDate: "2026-11-25",
  priority: "urgent",
  channel: "instagram",
  line1: "12, Rose Apartments",
  line2: "MG Road",
  landmark: "",
  city: "Jaipur",
  state: "Rajasthan",
  pin: "302001",
  discountType: "percent",
  discountValue: "10",
  shippingCharged: "80",
  notes: "",
  items: [
    boxItem(),
    {
      productId: ids.pouch,
      quantity: "1",
      unitPrice: "350",
      notes: "",
      customisations: [],
    },
  ],
  ...overrides,
});

async function create(overrides: Partial<OrderInput> = {}) {
  const target = await redirectTarget(createOrder(order(overrides)));
  const id = /^\/orders\/([0-9a-f-]{36})$/.exec(target)?.[1];
  if (!id) throw new Error(`Unexpected redirect ${target}`);
  return id;
}

describe("creating an order", () => {
  it("saves it with a code, snapshots, first stages, address and a history row", async () => {
    const id = await create();
    const saved = await getOrder(id);
    expect(saved).toMatchObject({
      code: "HMU-2611-0001",
      status: "in_production",
      priority: "urgent",
      channel: "instagram",
      orderDate: "2026-11-14",
      promisedDate: "2026-11-25",
      discount: { type: "percent", bp: 1_000 },
      shippingCharged: 8_000,
      customer: { code: "C-0001", name: "Ananya Sharma" },
      address: {
        line1: "12, Rose Apartments",
        city: "Jaipur",
        pin: "302001",
        landmark: null,
      },
    });
    const [box, pouch] = saved?.items ?? [];
    expect(box).toMatchObject({
      productName: "Square Box – Red Floral",
      quantity: 2,
      unitPrice: 120_000,
      unitCost: 45_000, // from the product
      notes: "Lining in gold",
      stage: { name: "Not started" },
      finished: false,
      customisations: [
        {
          name: "Latkan",
          choiceName: "Gold",
          text: null,
          price: 5_000,
          cost: 1_500,
        },
        {
          name: "Sticker",
          choiceName: null,
          text: "Happy Birthday",
          price: 3_000,
          cost: 500,
        },
      ],
    });
    expect(pouch).toMatchObject({ unitPrice: 35_000, customisations: [] });
    // (1200 + 50 + 30) × 2 + 350 = 2910; 10% off = 291; + 80 shipping
    expect(saved?.totals).toMatchObject({
      subtotal: 291_000,
      customisations: 16_000,
      discount: 29_100,
      total: 291_000 - 29_100 + 8_000,
    });
    expect(saved?.history).toMatchObject([
      { fromStatus: null, toStatus: "in_production" },
    ]);
  });

  it("keeps its prices when the catalogue changes later", async () => {
    const id = await create();
    const before = (await getOrder(id))?.totals.total;
    await db
      .update(products)
      .set({ price: 999_900, cost: 1 })
      .where(eq(products.id, ids.squareBox));
    await db
      .update(customisationOptions)
      .set({ extraPrice: 77_700 })
      .where(eq(customisationOptions.id, ids.latkan));
    expect((await getOrder(id))?.totals.total).toBe(before);
  });

  it("gives simultaneous orders different codes in the order date's month", async () => {
    const results = await Promise.allSettled([
      createOrder(order()),
      createOrder(order()),
      createOrder(
        order({ orderDate: "2026-12-01", promisedDate: "2026-12-05" }),
      ),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true); // all redirected
    const codes = (await db.select({ code: orders.code }).from(orders))
      .map((o) => o.code)
      .sort();
    expect(codes).toEqual(["HMU-2611-0001", "HMU-2611-0002", "HMU-2612-0001"]);
  });

  it("refuses customisations the product doesn't offer, or without their value", async () => {
    // The pouch only offers Sticker.
    expect(
      await createOrder(
        order({
          items: [
            {
              productId: ids.pouch,
              quantity: "1",
              unitPrice: "350",
              notes: "",
              customisations: [
                { optionId: ids.latkan, choiceId: ids.gold, text: null },
              ],
            },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { "items.0.customisations": expect.any(Array) },
    });
    expect(
      await createOrder(
        order({
          items: [
            boxItem({
              customisations: [
                { optionId: ids.latkan, choiceId: null, text: null },
              ],
            }),
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { "items.0.customisations": ["Choose a latkan option."] },
    });
    expect(
      await createOrder(
        order({
          items: [
            boxItem({
              customisations: [
                { optionId: ids.sticker, choiceId: null, text: "x".repeat(31) },
              ],
            }),
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        "items.0.customisations": [
          "Sticker text can be at most 30 characters.",
        ],
      },
    });
    expect(await db.$count(orders)).toBe(0);
  });

  it("refuses archived products, a flat discount above the items, and bad dates", async () => {
    await db
      .update(products)
      .set({ archivedAt: new Date() })
      .where(eq(products.id, ids.pouch));
    expect(await createOrder(order())).toMatchObject({
      ok: false,
      fieldErrors: { "items.1.productId": expect.any(Array) },
    });
    expect(
      await createOrder(
        order({
          items: [boxItem({ customisations: [] })],
          discountType: "flat",
          discountValue: "5000",
        }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { discountValue: expect.any(Array) },
    });
    expect(
      await createOrder(order({ promisedDate: "2026-11-01" })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { promisedDate: ["Can't be before the order date"] },
    });
    expect(await createOrder(order({ items: [] }))).toMatchObject({
      ok: false,
      fieldErrors: { items: ["Add at least one item"] },
    });
    expect(await db.$count(orderItems)).toBe(0);
    expect(await db.$count(orderItemCustomisations)).toBe(0);
    expect(await db.$count(statusHistory)).toBe(0);
  });

  it("needs a signed-in user", async () => {
    signOutTestUser();
    await expect(createOrder(order())).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });
});

describe("the orders list", () => {
  it("finds orders by code, customer name or mobile, newest first, with totals", async () => {
    await create();
    await create({
      orderDate: "2026-11-20",
      promisedDate: "2026-11-30",
      discountType: "none",
      discountValue: "",
    });
    const all = await getOrders();
    expect(all.map((o) => o.code)).toEqual(["HMU-2611-0002", "HMU-2611-0001"]);
    expect(all[0]).toMatchObject({
      customerName: "Ananya Sharma",
      total: 291_000 + 8_000,
    });
    expect((await getOrders("2611-0001")).map((o) => o.code)).toEqual([
      "HMU-2611-0001",
    ]);
    expect(await getOrders("ananya")).toHaveLength(2);
    expect(await getOrders("98100 00001")).toHaveLength(2);
    expect(await getOrders("nobody")).toEqual([]);
  });
});

describe("the order form's customer picker", () => {
  it("finds, loads and adds customers", async () => {
    const found = await findCustomers({ query: "ana" });
    expect(found.ok && found.data.map((c) => c.name)).toEqual([
      "Ananya Sharma",
    ]);
    const loaded = await getCustomerForPicker({ id: ids.customer });
    expect(loaded.ok && loaded.data.addresses[0]).toMatchObject({
      isDefault: true,
      city: "Jaipur",
    });
    const added = await createCustomerInline({
      mobile: "9845012345",
      instagramHandle: "",
      firstName: "Meera",
      lastName: "",
      source: "instagram",
      altMobile: "",
      email: "",
      notes: "",
      line1: "4B",
      line2: "",
      landmark: "",
      city: "Bengaluru",
      state: "Karnataka",
      pin: "560001",
    });
    expect(added).toMatchObject({
      ok: true,
      data: {
        code: "C-0004",
        name: "Meera",
        addresses: [{ city: "Bengaluru", isDefault: true }],
      },
    });
  });
});

describe("moving an order along", () => {
  const status = (
    orderId: string,
    to: Parameters<typeof changeStatus>[0]["to"],
    extra = {},
  ) =>
    changeStatus({
      orderId,
      to,
      note: "",
      deliveredDate: "",
      cancelReason: "",
      refundOwed: false,
      ...extra,
    });

  async function finishAll(orderId: string) {
    const items = (await getOrder(orderId))?.items ?? [];
    return changeItemStages({
      orderId,
      items: items.map((i) => ({
        itemId: i.id,
        stageId: i.stages.at(-1)?.id ?? "",
      })),
    });
  }

  it("advances items, then readies, delivers and records each step", async () => {
    const id = await create();
    expect(await status(id, "ready_for_pickup")).toEqual({
      ok: false,
      error: "Finish every item first (0 of 2 are at their last stage).",
    });
    expect(await finishAll(id)).toEqual({ ok: true, data: undefined });
    expect(await status(id, "ready_for_pickup")).toEqual({
      ok: true,
      data: undefined,
    });
    expect(
      await status(id, "delivered", { deliveredDate: "2026-11-14" }),
    ).toEqual({
      ok: true,
      data: undefined,
    });
    const saved = await getOrder(id);
    expect(saved).toMatchObject({
      status: "delivered",
      deliveredDate: "2026-11-14",
    });
    expect(saved?.items.every((i) => i.finished)).toBe(true);
    // Newest first: delivered, ready, two stage moves, created.
    expect(saved?.history.map((h) => h.toStatus ?? h.toStage)).toEqual([
      "delivered",
      "ready_for_pickup",
      expect.any(String),
      expect.any(String),
      "in_production",
    ]);
    expect(saved?.history[0]?.by).toBe("asha"); // who did it
  });

  it("refuses a delivered date in the future, and stage changes once ready", async () => {
    const id = await create();
    await finishAll(id);
    expect(
      await status(id, "delivered", { deliveredDate: "2999-01-01" }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { deliveredDate: ["Can't be after today"] },
    });
    await status(id, "ready_for_pickup");
    const item = (await getOrder(id))?.items[0];
    expect(
      await changeItemStages({
        orderId: id,
        items: [{ itemId: item?.id ?? "", stageId: item?.stages[0]?.id ?? "" }],
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Move it back/),
    });
  });

  it("asks why when cancelling", async () => {
    const id = await create();
    expect(await status(id, "cancelled")).toMatchObject({
      ok: false,
      fieldErrors: { cancelReason: ["Say why the order is cancelled"] },
    });
    expect(
      await status(id, "cancelled", {
        cancelReason: "Wrong colour",
        refundOwed: true,
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(await getOrder(id)).toMatchObject({
      status: "cancelled",
      cancelReason: "Wrong colour",
      refundOwed: true,
    });
  });
});

describe("editing an order", () => {
  async function edit(id: string, change: (input: OrderInput) => OrderInput) {
    const saved = await getOrder(id);
    if (!saved) throw new Error("no order");
    return updateOrder({ ...change(orderToInput(saved)), orderId: id });
  }

  it("keeps saved prices, costs and customisations; new ones take today's", async () => {
    const id = await create();
    // The catalogue changes after the order was placed.
    await db
      .update(products)
      .set({ price: 999_900, cost: 99_900 })
      .where(eq(products.id, ids.squareBox));
    await db.update(customisationOptions).set({ extraPrice: 77_700 });
    await redirectTarget(
      edit(id, (input) => ({
        ...input,
        items: input.items.map((item, i) =>
          i === 0
            ? {
                ...item,
                quantity: "3",
                // Latkan unchanged; sticker text changed → priced today.
                customisations: item.customisations.map((c) =>
                  c.optionId === ids.sticker
                    ? { ...c, text: "Shubh Vivah" }
                    : c,
                ),
              }
            : item,
        ),
      })),
    );
    const box = (await getOrder(id))?.items[0];
    expect(box).toMatchObject({
      quantity: 3,
      unitPrice: 120_000,
      unitCost: 45_000, // not today's 99,900
      customisations: [
        { name: "Latkan", choiceName: "Gold", price: 5_000 }, // kept
        { name: "Sticker", text: "Shubh Vivah", price: 77_700 }, // changed: today's
      ],
    });
  });

  it("adds and removes items; history of a removed item stays with the order", async () => {
    const id = await create();
    const pouch = (await getOrder(id))?.items[1];
    await changeItemStages({
      orderId: id,
      items: [{ itemId: pouch?.id ?? "", stageId: pouch?.stages[1]?.id ?? "" }],
    });
    await redirectTarget(
      edit(id, (input) => ({
        ...input,
        items: [
          input.items[0] as OrderItemInput,
          {
            productId: ids.squareBox,
            quantity: "1",
            unitPrice: "999",
            notes: "",
            customisations: [],
          },
        ],
      })),
    );
    const saved = await getOrder(id);
    expect(
      saved?.items.map((i) => [i.productName, i.unitPrice, i.stage.name]),
    ).toEqual([
      ["Square Box – Red Floral", 120_000, "Not started"],
      ["Square Box – Red Floral", 99_900, "Not started"],
    ]);
    expect(saved?.history.find((h) => h.toStage)).toMatchObject({
      itemName: null, // the pouch is gone, its stage move is still in the history
      toStage: "Stitched",
    });
  });

  it("only adds items while the order is in production or on hold", async () => {
    const id = await create({ items: [boxItem({ customisations: [] })] });
    const item = (await getOrder(id))?.items[0];
    await changeItemStages({
      orderId: id,
      items: [
        { itemId: item?.id ?? "", stageId: item?.stages.at(-1)?.id ?? "" },
      ],
    });
    await changeStatus({
      orderId: id,
      to: "ready_for_pickup",
      note: "",
      deliveredDate: "",
      cancelReason: "",
      refundOwed: false,
    });
    expect(
      await edit(id, (input) => ({
        ...input,
        items: [...input.items, boxItem({ customisations: [] })],
      })),
    ).toMatchObject({ ok: false, fieldErrors: { items: expect.any(Array) } });
    // Other edits are fine.
    await redirectTarget(
      edit(id, (input) => ({ ...input, priority: "normal" })),
    );
    expect((await getOrder(id))?.priority).toBe("normal");
  });

  it("keeps a customisation Settings has since retired, but won't add it anew", async () => {
    const id = await create();
    await db
      .update(customisationOptions)
      .set({ active: false })
      .where(eq(customisationOptions.id, ids.latkan));
    await redirectTarget(
      edit(id, (input) => ({ ...input, notes: "Gift wrap" })),
    );
    expect(
      (await getOrder(id))?.items[0]?.customisations.map((c) => c.name),
    ).toEqual(["Latkan", "Sticker"]);
    expect(
      await edit(id, (input) => ({
        ...input,
        items: [...input.items, boxItem()],
      })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { "items.2.customisations": expect.any(Array) },
    });
  });

  it("refuses items that aren't this order's", async () => {
    const id = await create();
    const other = await create();
    const foreign = (await getOrder(other))?.items[0]?.id;
    expect(
      await edit(id, (input) => ({
        ...input,
        items: [{ ...(input.items[0] as OrderItemInput), id: foreign }],
      })),
    ).toMatchObject({
      ok: false,
      error: "This order changed meanwhile. Reload the page.",
    });
  });
});

describe("duplicating an order", () => {
  it("copies customer, address and items at today's prices, skipping what's gone", async () => {
    const id = await create();
    await db
      .update(products)
      .set({ price: 130_000 })
      .where(eq(products.id, ids.squareBox));
    await db
      .update(products)
      .set({ archivedAt: new Date() })
      .where(eq(products.id, ids.pouch));
    const original = await getOrder(id);
    if (!original) throw new Error("no order");
    const { input, skipped } = duplicateToInput(
      original,
      await getOrderCatalogue(),
      "2026-12-01",
    );
    expect(skipped).toEqual(["Potli Pouch – Emerald"]);
    expect(input).toMatchObject({
      customerId: ids.customer,
      city: "Jaipur",
      orderDate: "2026-12-01",
      promisedDate: "",
      discountType: "none",
      items: [{ productId: ids.squareBox, quantity: "2", unitPrice: "1300" }],
    });
    expect(input.items[0]?.customisations).toHaveLength(2);
    const copy = await redirectTarget(
      createOrder({ ...input, promisedDate: "2026-12-10" }),
    );
    expect(copy).toMatch(/^\/orders\//);
    expect((await getOrders()).map((o) => o.code)).toContain("HMU-2612-0001");
  });
});
