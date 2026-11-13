// The database itself rejects bad data (CLAUDE.md "Quality controls"), even if a bug or
// an import skips the Zod schemas. Each test inserts one bad row and expects the named
// constraint to fire.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./client";
import * as s from "./schema";
import { createUserWithPassword } from "./users";

let by: { createdBy: string; updatedBy: string };

/** Expects `promise` to fail on the constraint called `name`. */
async function rejectsWith(promise: Promise<unknown>, name: string) {
  await expect(promise).rejects.toMatchObject({
    cause: expect.objectContaining({ constraint: name }),
  });
}

async function makeCategory(name = "Box") {
  const [category] = await db
    .insert(s.categories)
    .values({ name, ...by })
    .returning();
  const stages = await db
    .insert(s.productionStages)
    .values(
      ["Not Started", "Finishing Done"].map((stage, position) => ({
        categoryId: category!.id,
        name: stage,
        position,
        ...by,
      })),
    )
    .returning();
  return { category: category!, stages };
}

let customerNumber = 0;
async function makeCustomer(
  overrides: Partial<typeof s.customers.$inferInsert> = {},
) {
  customerNumber += 1;
  const [customer] = await db
    .insert(s.customers)
    .values({
      number: customerNumber,
      firstName: "Asha",
      mobile: String(9000000000 + customerNumber),
      ...by,
      ...overrides,
    })
    .returning();
  return customer!;
}

const address = {
  deliveryLine1: "12 MG Road",
  deliveryCity: "Jaipur",
  deliveryState: "Rajasthan",
  deliveryPin: "302001",
};

let orderSeq = 0;
async function makeOrder(
  overrides: Partial<typeof s.orders.$inferInsert> = {},
) {
  orderSeq += 1;
  const customer = await makeCustomer();
  const [order] = await db
    .insert(s.orders)
    .values({
      code: `HMU-2611-${String(orderSeq).padStart(4, "0")}`,
      customerId: customer.id,
      orderDate: "2026-11-14",
      promisedDate: "2026-11-20",
      ...address,
      ...by,
      ...overrides,
    })
    .returning();
  return order!;
}

async function makeProduct(categoryId: string, sku = "BOX-SQ-RED-01") {
  const [product] = await db
    .insert(s.products)
    .values({
      sku,
      name: "Square Box",
      categoryId,
      price: 120000,
      cost: 45000,
      ...by,
    })
    .returning();
  return product!;
}

beforeEach(async () => {
  const user = await createUserWithPassword(db, {
    username: "asha",
    name: "Asha",
    password: "correct-horse-battery",
  });
  by = { createdBy: user.id, updatedBy: user.id };
  customerNumber = 0;
  orderSeq = 0;
});

describe("customers", () => {
  it("accepts a valid customer and fills audit columns", async () => {
    const customer = await makeCustomer({ instagramHandle: "asha.crafts" });
    expect(customer.createdBy).toBe(by.createdBy);
    expect(customer.createdAt).toBeInstanceOf(Date);
  });

  it("requires a 10-digit mobile, unique", async () => {
    await rejectsWith(makeCustomer({ mobile: "98765" }), "customers_mobile");
    await rejectsWith(
      makeCustomer({ mobile: "+919876543210" }),
      "customers_mobile",
    );
    await makeCustomer({ mobile: "9876543210" });
    await rejectsWith(
      makeCustomer({ mobile: "9876543210" }),
      "customers_mobile_unique",
    );
  });

  it("stores Instagram handles lower-case without @, unique", async () => {
    await rejectsWith(
      makeCustomer({ instagramHandle: "@asha" }),
      "customers_instagram_handle",
    );
    await rejectsWith(
      makeCustomer({ instagramHandle: "Asha" }),
      "customers_instagram_handle",
    );
    await makeCustomer({ instagramHandle: "asha" });
    await rejectsWith(
      makeCustomer({ instagramHandle: "asha" }),
      "customers_instagram_handle_unique",
    );
  });

  it("allows one default address per customer, with a valid PIN", async () => {
    const { id: customerId } = await makeCustomer();
    const addr = {
      customerId,
      line1: "1",
      city: "Jaipur",
      state: "Rajasthan",
      ...by,
    };
    await rejectsWith(
      db.insert(s.customerAddresses).values({ ...addr, pin: "02001" }),
      "customer_addresses_pin",
    );
    await db
      .insert(s.customerAddresses)
      .values({ ...addr, pin: "302001", isDefault: true });
    await rejectsWith(
      db
        .insert(s.customerAddresses)
        .values({ ...addr, pin: "302002", isDefault: true }),
      "customer_addresses_one_default",
    );
    await db.insert(s.customerAddresses).values({ ...addr, pin: "302002" });
  });
});

describe("managed lists and catalogue", () => {
  it("rejects names that differ only by case or stray spaces", async () => {
    await db.insert(s.listItems).values({ kind: "colour", name: "Red", ...by });
    await rejectsWith(
      db.insert(s.listItems).values({ kind: "colour", name: "red", ...by }),
      "list_items_kind_name_unique",
    );
    await rejectsWith(
      db.insert(s.listItems).values({ kind: "colour", name: "Red ", ...by }),
      "list_items_name",
    );
    // Same name in a different list is fine.
    await db.insert(s.listItems).values({ kind: "design", name: "Red", ...by });
  });

  it("keeps SKUs unique ignoring case, and money and sizes non-negative", async () => {
    const { category } = await makeCategory();
    await makeProduct(category.id, "BOX-01");
    await rejectsWith(
      makeProduct(category.id, "box-01"),
      "products_sku_unique",
    );
    const base = { name: "X", categoryId: category.id, cost: 0, ...by };
    await rejectsWith(
      db.insert(s.products).values({ ...base, sku: "A", price: -1 }),
      "products_price",
    );
    await rejectsWith(
      db
        .insert(s.products)
        .values({ ...base, sku: "B", price: 1, lengthMm: 0 }),
      "products_length",
    );
  });

  it("only gives text customisations a max length", async () => {
    const option = { extraPrice: 5000, extraCost: 1000, ...by };
    await rejectsWith(
      db
        .insert(s.customisationOptions)
        .values({ ...option, name: "Sticker", inputType: "text" }),
      "customisation_options_max_length",
    );
    await rejectsWith(
      db.insert(s.customisationOptions).values({
        ...option,
        name: "Latkan",
        inputType: "choice",
        maxLength: 10,
      }),
      "customisation_options_max_length",
    );
    await db
      .insert(s.customisationOptions)
      .values({ ...option, name: "Sticker", inputType: "text", maxLength: 20 });
  });

  it("requires tracking URL templates to contain {awb}", async () => {
    await rejectsWith(
      db.insert(s.deliveryPartners).values({
        name: "Delhivery",
        trackingUrlTemplate: "https://www.delhivery.com/track",
        ...by,
      }),
      "delivery_partners_tracking_url",
    );
  });
});

describe("orders", () => {
  it("checks the order code, dates, discount and PIN", async () => {
    await rejectsWith(makeOrder({ code: "HMU-26-1" }), "orders_code");
    await rejectsWith(
      makeOrder({ promisedDate: "2026-11-01" }),
      "orders_promised_after_order",
    );
    await rejectsWith(
      makeOrder({ discountPercentBp: 10001, discountType: "percent" }),
      "orders_discount_percent",
    );
    await rejectsWith(
      makeOrder({
        discountType: "flat",
        discountFlat: 100,
        discountPercentBp: 500,
      }),
      "orders_discount_type",
    );
    await rejectsWith(makeOrder({ discountFlat: 100 }), "orders_discount_type");
    await rejectsWith(
      makeOrder({ deliveryPin: "1234567" }),
      "orders_delivery_pin",
    );
    await makeOrder({ discountType: "percent", discountPercentBp: 1250 });
  });

  it("needs a delivered date when delivered and a reason when cancelled", async () => {
    await rejectsWith(
      makeOrder({ status: "delivered" }),
      "orders_delivered_date",
    );
    await rejectsWith(
      makeOrder({ status: "cancelled", cancelReason: " " }),
      "orders_cancel_reason",
    );
    await makeOrder({ status: "delivered", deliveredDate: "2026-11-19" });
  });

  it("keeps an item's production stage within its category", async () => {
    const box = await makeCategory("Box");
    const pouch = await makeCategory("Pouch");
    const product = await makeProduct(box.category.id);
    const order = await makeOrder();
    const item = {
      orderId: order.id,
      productId: product.id,
      categoryId: box.category.id,
      unitPrice: 120000,
      unitCost: 45000,
      ...by,
    };
    await rejectsWith(
      db
        .insert(s.orderItems)
        .values({ ...item, productionStageId: pouch.stages[0]!.id }),
      "order_items_stage_in_category_fk",
    );
    await rejectsWith(
      db
        .insert(s.orderItems)
        .values({ ...item, productionStageId: box.stages[0]!.id, quantity: 0 }),
      "order_items_quantity",
    );
    await db
      .insert(s.orderItems)
      .values({ ...item, productionStageId: box.stages[0]!.id });

    // A stage or product in use can't be deleted.
    await rejectsWith(
      db
        .delete(s.productionStages)
        .where(eq(s.productionStages.id, box.stages[0]!.id)),
      "order_items_stage_in_category_fk",
    );
    await rejectsWith(
      db.delete(s.products).where(eq(s.products.id, product.id)),
      "order_items_product_id_products_id_fk",
    );
  });

  it("records either a status change or a stage change in history", async () => {
    const order = await makeOrder();
    const { stages } = await makeCategory();
    await db.insert(s.statusHistory).values({
      orderId: order.id,
      fromStatus: "in_production",
      toStatus: "ready_for_pickup",
      ...by,
    });
    await rejectsWith(
      db.insert(s.statusHistory).values({
        orderId: order.id,
        toStatus: "in_transit",
        toStageId: stages[1]!.id,
        ...by,
      }),
      "status_history_kind",
    );
    await rejectsWith(
      db.insert(s.statusHistory).values({ orderId: order.id, ...by }),
      "status_history_kind",
    );
  });
});

describe("shipments and payments", () => {
  async function partner(name = "Delhivery") {
    const [row] = await db
      .insert(s.deliveryPartners)
      .values({ name, ...by })
      .returning();
    return row!;
  }

  it("keeps AWB numbers unique per delivery partner", async () => {
    const order = await makeOrder();
    const delhivery = await partner("Delhivery");
    const dtdc = await partner("DTDC");
    const shipment = {
      orderId: order.id,
      bookedVia: "direct" as const,
      awb: "AWB123",
      ...by,
    };
    await db
      .insert(s.shipments)
      .values({ ...shipment, deliveryPartnerId: delhivery.id });
    await db
      .insert(s.shipments)
      .values({ ...shipment, deliveryPartnerId: dtdc.id });
    await rejectsWith(
      db
        .insert(s.shipments)
        .values({ ...shipment, deliveryPartnerId: delhivery.id }),
      "shipments_partner_awb_unique",
    );
  });

  it("needs an aggregator only when booked via one, and an AWB once in transit", async () => {
    const order = await makeOrder();
    const { id: deliveryPartnerId } = await partner();
    const base = { orderId: order.id, deliveryPartnerId, ...by };
    await rejectsWith(
      db.insert(s.shipments).values({ ...base, bookedVia: "aggregator" }),
      "shipments_aggregator",
    );
    await rejectsWith(
      db
        .insert(s.shipments)
        .values({ ...base, bookedVia: "direct", status: "in_transit" }),
      "shipments_awb_required",
    );
  });

  it("makes refunds negative and other payments positive", async () => {
    const order = await makeOrder();
    const payment = {
      orderId: order.id,
      paidOn: "2026-11-14",
      mode: "upi" as const,
      ...by,
    };
    await db
      .insert(s.payments)
      .values({ ...payment, type: "advance", amount: 50000 });
    await db
      .insert(s.payments)
      .values({ ...payment, type: "refund", amount: -50000 });
    await rejectsWith(
      db
        .insert(s.payments)
        .values({ ...payment, type: "refund", amount: 50000 }),
      "payments_amount_sign",
    );
    await rejectsWith(
      db.insert(s.payments).values({ ...payment, type: "balance", amount: 0 }),
      "payments_amount_sign",
    );
  });
});

describe("audit columns", () => {
  it("must name an existing user", async () => {
    await rejectsWith(
      db.insert(s.listItems).values({
        kind: "colour",
        name: "Blue",
        createdBy: "nobody",
        updatedBy: "nobody",
      }),
      "list_items_created_by_users_id_fk",
    );
  });
});
