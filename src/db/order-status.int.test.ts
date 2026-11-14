import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./client";
import {
  changeOrderStatus,
  OrderRuleError,
  recordOrderCreated,
  setItemStages,
} from "./order-status";
import {
  categories,
  customers,
  deliveryPartners,
  orderItems,
  orders,
  productionStages,
  products,
  shipments,
  statusHistory,
} from "./schema";
import { createUserWithPassword } from "./users";

let userId: string;
let orderId: string;
let box: { itemId: string; stages: string[] };
let pouch: { itemId: string; stages: string[] };

/** Two categories with their own stages, and an order with one item of each. */
beforeEach(async () => {
  ({ id: userId } = await createUserWithPassword(db, {
    username: "asha",
    name: "Asha",
    password: "correct-horse-battery",
  }));
  const by = { createdBy: userId, updatedBy: userId };

  async function category(name: string, stageNames: string[]) {
    const [cat] = await db
      .insert(categories)
      .values({ name, sortOrder: 0, ...by })
      .returning();
    if (!cat) throw new Error("setup");
    const stages = await db
      .insert(productionStages)
      .values(
        stageNames.map((n, position) => ({
          categoryId: cat.id,
          name: n,
          position,
          ...by,
        })),
      )
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        sku: name.toUpperCase(),
        name,
        categoryId: cat.id,
        price: 1000,
        cost: 500,
        ...by,
      })
      .returning();
    if (!product) throw new Error("setup");
    return {
      categoryId: cat.id,
      productId: product.id,
      stages: stages.map((s) => s.id),
    };
  }
  const boxCat = await category("Box", [
    "Not started",
    "Outer done",
    "Finished",
  ]);
  const pouchCat = await category("Pouch", ["Not started", "Stitched"]);

  const [customer] = await db
    .insert(customers)
    .values({ number: 1, firstName: "Ananya", mobile: "9810000001", ...by })
    .returning();
  const [order] = await db
    .insert(orders)
    .values({
      code: "HMU-2611-0001",
      customerId: customer?.id ?? "",
      orderDate: "2026-11-01",
      promisedDate: "2026-11-20",
      deliveryLine1: "1",
      deliveryCity: "Jaipur",
      deliveryState: "Rajasthan",
      deliveryPin: "302001",
      ...by,
    })
    .returning();
  if (!order) throw new Error("setup");
  orderId = order.id;
  await recordOrderCreated(db, { orderId, userId });

  async function item(cat: Awaited<ReturnType<typeof category>>) {
    const [row] = await db
      .insert(orderItems)
      .values({
        orderId,
        productId: cat.productId,
        categoryId: cat.categoryId,
        productionStageId: cat.stages[0] ?? "",
        unitPrice: 1000,
        unitCost: 500,
        ...by,
      })
      .returning();
    return { itemId: row?.id ?? "", stages: cat.stages };
  }
  box = await item(boxCat);
  pouch = await item(pouchCat);
});

const status = async () =>
  (await db.select().from(orders).where(eq(orders.id, orderId)))[0];

const history = async () =>
  db
    .select({
      from: statusHistory.fromStatus,
      to: statusHistory.toStatus,
      fromStage: statusHistory.fromStageId,
      toStage: statusHistory.toStageId,
      item: statusHistory.orderItemId,
      note: statusHistory.note,
      by: statusHistory.createdBy,
    })
    .from(statusHistory)
    .where(eq(statusHistory.orderId, orderId))
    .orderBy(asc(statusHistory.createdAt), asc(statusHistory.id));

const change = (
  input: Omit<Parameters<typeof changeOrderStatus>[1], "orderId" | "userId">,
) =>
  db.transaction((tx) => changeOrderStatus(tx, { orderId, userId, ...input }));

const finishAll = () =>
  db.transaction((tx) =>
    setItemStages(tx, {
      orderId,
      userId,
      items: [
        { itemId: box.itemId, stageId: box.stages[2] ?? "" },
        { itemId: pouch.itemId, stageId: pouch.stages[1] ?? "" },
      ],
    }),
  );

describe("item stages", () => {
  it("move forward or back, each move recorded", async () => {
    await db.transaction((tx) =>
      setItemStages(tx, {
        orderId,
        userId,
        items: [{ itemId: box.itemId, stageId: box.stages[1] ?? "" }],
      }),
    );
    await db.transaction((tx) =>
      setItemStages(tx, {
        orderId,
        userId,
        items: [
          { itemId: box.itemId, stageId: box.stages[0] ?? "" },
          { itemId: pouch.itemId, stageId: pouch.stages[0] ?? "" }, // unchanged: skipped
        ],
      }),
    );
    const rows = await history();
    expect(
      rows.map((r) => [r.from, r.to, r.fromStage, r.toStage, r.item]),
    ).toEqual([
      [null, "in_production", null, null, null],
      [null, null, box.stages[0], box.stages[1], box.itemId],
      [null, null, box.stages[1], box.stages[0], box.itemId],
    ]);
    expect(rows.every((r) => r.by === userId)).toBe(true);
  });

  it("refuse a stage from another category", async () => {
    await expect(
      db.transaction((tx) =>
        setItemStages(tx, {
          orderId,
          userId,
          items: [{ itemId: box.itemId, stageId: pouch.stages[1] ?? "" }],
        }),
      ),
    ).rejects.toThrow(OrderRuleError);
  });

  it("are locked once the order is ready, until it's moved back", async () => {
    await finishAll();
    await change({ to: "ready_for_pickup" });
    await expect(
      db.transaction((tx) =>
        setItemStages(tx, {
          orderId,
          userId,
          items: [{ itemId: box.itemId, stageId: box.stages[0] ?? "" }],
        }),
      ),
    ).rejects.toThrow(/Move it back to In production/);
  });
});

describe("order status", () => {
  it("Ready for pickup needs every item at its last stage (one tap, never automatic)", async () => {
    await expect(change({ to: "ready_for_pickup" })).rejects.toThrow(
      "Finish every item first (0 of 2 are at their last stage).",
    );
    await finishAll();
    expect((await status())?.status).toBe("in_production"); // didn't move by itself
    await change({ to: "ready_for_pickup" });
    expect((await status())?.status).toBe("ready_for_pickup");
  });

  it("Delivered sets the delivered date; leaving it clears the date", async () => {
    await finishAll();
    await change({ to: "delivered", deliveredDate: "2026-11-15" }); // hand-over, no shipment
    expect(await status()).toMatchObject({
      status: "delivered",
      deliveredDate: "2026-11-15",
    });
    await change({
      to: "in_production",
      note: "Customer sent it back for a fix",
    });
    expect(await status()).toMatchObject({
      status: "in_production",
      deliveredDate: null,
    });
    expect((await history()).at(-1)).toMatchObject({
      from: "delivered",
      to: "in_production",
      note: "Customer sent it back for a fix",
    });
  });

  it("refuses a delivered date before the order date", async () => {
    await finishAll();
    await expect(
      change({ to: "delivered", deliveredDate: "2026-10-31" }), // ordered 2026-11-01
    ).rejects.toThrow("The delivered date can't be before the order date.");
    await change({ to: "delivered", deliveredDate: "2026-11-01" }); // same day is fine
  });

  it("Cancelled needs a reason and records whether a refund is owed", async () => {
    await expect(change({ to: "cancelled" })).rejects.toThrow(/why/);
    await change({
      to: "cancelled",
      cancelReason: " Changed their mind ",
      refundOwed: true,
    });
    expect(await status()).toMatchObject({
      status: "cancelled",
      cancelReason: "Changed their mind",
      refundOwed: true,
    });
    expect((await history()).at(-1)?.note).toBe("Changed their mind");
    await change({ to: "on_hold" }); // corrections are allowed
    // Leaving Cancelled clears the cancel details (the reason stays in the history).
    expect(await status()).toMatchObject({
      status: "on_hold",
      cancelReason: null,
      refundOwed: false,
    });
  });

  it("Docket raised needs a shipment, In transit an AWB", async () => {
    await finishAll();
    await change({ to: "ready_for_pickup" });
    await expect(change({ to: "docket_raised" })).rejects.toThrow(/shipment/);
    const [partner] = await db
      .insert(deliveryPartners)
      .values({
        name: "Delhivery",
        sortOrder: 0,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    const [shipment] = await db
      .insert(shipments)
      .values({
        orderId,
        bookedVia: "direct",
        deliveryPartnerId: partner?.id ?? "",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    await change({ to: "docket_raised" });
    await expect(change({ to: "in_transit" })).rejects.toThrow(/AWB/);
    await db
      .update(shipments)
      .set({ awb: "1234567890" })
      .where(eq(shipments.id, shipment?.id ?? ""));
    await change({ to: "in_transit" });
    expect((await status())?.status).toBe("in_transit");
  });

  it("refuses a missing order and a change to the same status", async () => {
    await expect(change({ to: "in_production" })).rejects.toThrow(/already/);
    await expect(
      db.transaction((tx) =>
        changeOrderStatus(tx, {
          orderId: "00000000-0000-4000-8000-000000000000",
          to: "on_hold",
          userId,
        }),
      ),
    ).rejects.toThrow("That order no longer exists. Reload the page.");
  });

  it("serialises concurrent changes: two people can't both move it from the same status", async () => {
    await finishAll();
    const results = await Promise.allSettled([
      change({ to: "ready_for_pickup" }),
      change({ to: "ready_for_pickup" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await history()).filter((r) => r.to === "ready_for_pickup"),
    ).toHaveLength(1);
  });
});
