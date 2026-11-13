import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { db } from "@/db/client";
import * as s from "@/db/schema";
import { signInTestUser } from "@/db/test/session";
import {
  addCategory,
  addStage,
  deleteStage,
  moveCategory,
  moveStage,
  renameStage,
  setCategoryActive,
} from "./actions";
import { getCategories, getCategoryWithStages } from "./queries";

let userId: string;

beforeEach(async () => {
  ({ userId } = await signInTestUser());
});

async function category(name: string) {
  expect(await addCategory({ name })).toEqual({ ok: true, data: undefined });
  const row = (await getCategories()).find((c) => c.name === name);
  if (!row) throw new Error(`Category ${name} not created`);
  return row;
}

async function stages(categoryId: string) {
  const result = await getCategoryWithStages(categoryId);
  return result?.stages ?? [];
}

const stageNames = async (categoryId: string) =>
  (await stages(categoryId)).map((st) => st.name);

describe("categories", () => {
  it("start with a 'Not started' stage and link to their stages page", async () => {
    const box = await category("Box");
    expect(box).toMatchObject({
      detail: "1 stage",
      href: `/settings/categories/${box.id}`,
    });
    expect(await stages(box.id)).toMatchObject([
      {
        name: "Not started",
        detail: "Only stage: items start and finish here",
      },
    ]);
  });

  it("reorder, deactivate and reject duplicates", async () => {
    const box = await category("Box");
    await category("Pouch");
    expect(await addCategory({ name: "box" })).toMatchObject({
      ok: false,
      fieldErrors: { name: ["Already in the list"] },
    });
    await moveCategory({ id: box.id, direction: "down" });
    await setCategoryActive({ id: box.id, active: false });
    expect((await getCategories()).map((c) => [c.name, c.active])).toEqual([
      ["Pouch", true],
      ["Box", false],
    ]);
  });
});

describe("production stages", () => {
  it("are added at the end, renamed and reordered within their category", async () => {
    const box = await category("Box");
    const pouch = await category("Pouch");
    for (const name of ["Outer Fabric Done", "Finishing Done"]) {
      await addStage({ categoryId: box.id, name });
    }
    await addStage({ categoryId: pouch.id, name: "Stitched" });

    expect(await stages(box.id)).toMatchObject([
      { name: "Not started", detail: "Where new items start" },
      { name: "Outer Fabric Done", detail: null },
      { name: "Finishing Done", detail: "Last stage: the item is finished" },
    ]);

    const [, outer] = await stages(box.id);
    await addStage({ categoryId: box.id, name: "Handles & Lace Done" });
    const handles = (await stages(box.id)).at(-1)!;
    await moveStage({ id: handles.id, direction: "up" });
    await renameStage({ id: outer!.id, name: "Outer fabric done" });
    expect(await stageNames(box.id)).toEqual([
      "Not started",
      "Outer fabric done",
      "Handles & Lace Done",
      "Finishing Done",
    ]);
    // Moving within Box doesn't touch Pouch.
    expect(await stageNames(pouch.id)).toEqual(["Not started", "Stitched"]);
  });

  it("reject a duplicate name within the category, but not across categories", async () => {
    const box = await category("Box");
    const pouch = await category("Pouch");
    await addStage({ categoryId: box.id, name: "Stitched" });
    expect(
      await addStage({ categoryId: box.id, name: "STITCHED" }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { name: ["Already in the list"] },
    });
    expect(await addStage({ categoryId: pouch.id, name: "Stitched" })).toEqual({
      ok: true,
      data: undefined,
    });
  });

  it("can be deleted, but never the last one", async () => {
    const box = await category("Box");
    await addStage({ categoryId: box.id, name: "Done" });
    const [first, done] = await stages(box.id);
    expect(await deleteStage({ id: done!.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await deleteStage({ id: first!.id })).toEqual({
      ok: false,
      error: "A category needs at least one stage. Rename this one instead.",
    });
    expect(await stageNames(box.id)).toEqual(["Not started"]);
  });

  it("can't be deleted while an order item is at that stage", async () => {
    const box = await category("Box");
    await addStage({ categoryId: box.id, name: "Done" });
    const [notStarted] = await stages(box.id);
    const by = { createdBy: userId, updatedBy: userId };

    const [customer] = await db
      .insert(s.customers)
      .values({ number: 1, firstName: "Asha", mobile: "9876543210", ...by })
      .returning();
    const [order] = await db
      .insert(s.orders)
      .values({
        code: "HMU-2611-0001",
        customerId: customer!.id,
        orderDate: "2026-11-14",
        promisedDate: "2026-11-20",
        deliveryLine1: "1",
        deliveryCity: "Jaipur",
        deliveryState: "Rajasthan",
        deliveryPin: "302001",
        ...by,
      })
      .returning();
    const [product] = await db
      .insert(s.products)
      .values({
        sku: "BOX-1",
        name: "Box",
        categoryId: box.id,
        price: 100000,
        cost: 40000,
        ...by,
      })
      .returning();
    await db.insert(s.orderItems).values({
      orderId: order!.id,
      productId: product!.id,
      categoryId: box.id,
      productionStageId: notStarted!.id,
      unitPrice: 100000,
      unitCost: 40000,
      ...by,
    });

    expect(await deleteStage({ id: notStarted!.id })).toEqual({
      ok: false,
      error:
        "Orders use this stage, so it can't be deleted. Rename it instead.",
    });
    const [row] = await db
      .select()
      .from(s.productionStages)
      .where(eq(s.productionStages.id, notStarted!.id));
    expect(row).toBeDefined();
  });

  it("can't be added to a category that doesn't exist", async () => {
    expect(
      await addStage({
        categoryId: "00000000-0000-4000-8000-000000000000",
        name: "X",
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no longer exists/),
    });
  });
});
