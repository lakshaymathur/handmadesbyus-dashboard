import type { Database } from "./connect";
import { nextCustomerNumber } from "./id-counters";
import * as s from "./schema";

// Sample business data for local development (`npm run db:seed` / `db:reset`), loaded
// only into databases marked disposable (src/db/disposable.ts). Real data stays in the
// spreadsheet until the import (M8). Everything here is made up: names, numbers and
// handles are fictional, and tracking links are examples to check before real use.
// Money is written in paise (CLAUDE.md: never floating-point rupees).

const BOX_STAGES = [
  "Not started",
  "Outer fabric done",
  "Handles & lace done",
  "Finishing done",
];
const POUCH_STAGES = ["Not started", "Stitched", "Finishing done"];

const LISTS = {
  product_type: ["Square", "Rectangle", "Hexagon", "Trunk"],
  colour: ["Red", "Gold", "Ivory", "Pastel blue", "Emerald"],
  design: ["Plain", "Floral", "Mandala", "Zari border"],
  aggregator: ["Shiprocket"],
} as const;

const PARTNERS = [
  {
    name: "Delhivery",
    trackingUrlTemplate: "https://www.delhivery.com/track/package/{awb}",
  },
  { name: "DTDC", trackingUrlTemplate: null },
  { name: "India Post", trackingUrlTemplate: null },
  { name: "Blue Dart", trackingUrlTemplate: null },
];

const CUSTOMERS = [
  {
    firstName: "Ananya",
    lastName: "Sharma",
    mobile: "9810000001",
    instagramHandle: "ananya.creates",
    source: "instagram",
    city: "Jaipur",
    state: "Rajasthan",
    pin: "302001",
  },
  {
    firstName: "Rohit",
    lastName: null,
    mobile: "9820000002",
    instagramHandle: null,
    source: "whatsapp",
    city: "Pune",
    state: "Maharashtra",
    pin: "411001",
  },
  {
    firstName: "Fatima",
    lastName: "Khan",
    mobile: "9830000003",
    instagramHandle: "fatima_gifts",
    source: "referral",
    city: "Lucknow",
    state: "Uttar Pradesh",
    pin: "226001",
  },
] as const;

/** True if sample data (or real settings) are already there: categories exist. */
export async function hasSampleData(db: Database): Promise<boolean> {
  return (await db.$count(s.categories)) > 0;
}

/**
 * Loads the sample data in one transaction, recorded as created by `userId`. Does
 * nothing if categories already exist, so it's safe to run again.
 */
export async function seedSampleData(
  db: Database,
  userId: string,
): Promise<{ loaded: boolean }> {
  if (await hasSampleData(db)) return { loaded: false };
  const by = { createdBy: userId, updatedBy: userId };

  await db.transaction(async (tx) => {
    await tx
      .insert(s.appSettings)
      .values({ id: 1, dueSoonDays: 3, ...by })
      .onConflictDoNothing();

    // Categories and their production stages (§2.6).
    const [box, pouch] = await tx
      .insert(s.categories)
      .values([
        { name: "Box", sortOrder: 0, ...by },
        { name: "Pouch", sortOrder: 1, ...by },
      ])
      .returning();
    if (!box || !pouch) throw new Error("Category insert returned no rows");
    for (const [category, stages] of [
      [box, BOX_STAGES],
      [pouch, POUCH_STAGES],
    ] as const) {
      await tx.insert(s.productionStages).values(
        stages.map((name, position) => ({
          categoryId: category.id,
          name,
          position,
          ...by,
        })),
      );
    }

    // Managed lists, by kind and name for the products below.
    const items = await tx
      .insert(s.listItems)
      .values(
        Object.entries(LISTS).flatMap(([kind, names]) =>
          names.map((name, sortOrder) => ({
            kind: kind as keyof typeof LISTS,
            name,
            sortOrder,
            ...by,
          })),
        ),
      )
      .returning();
    const item = (kind: keyof typeof LISTS, name: string) => {
      const found = items.find((i) => i.kind === kind && i.name === name);
      if (!found) throw new Error(`No sample ${kind} "${name}"`);
      return found.id;
    };

    await tx
      .insert(s.deliveryPartners)
      .values(PARTNERS.map((p, sortOrder) => ({ ...p, sortOrder, ...by })));

    // Customisation options (§2.3): Latkan (choice) and Sticker (text), for boxes.
    const [latkan, sticker] = await tx
      .insert(s.customisationOptions)
      .values([
        {
          name: "Latkan",
          inputType: "choice",
          extraPrice: 5_000 /* ₹50 */,
          extraCost: 1_500 /* ₹15 */,
          sortOrder: 0,
          ...by,
        },
        {
          name: "Sticker",
          inputType: "text",
          maxLength: 30,
          extraPrice: 3_000 /* ₹30 */,
          extraCost: 500 /* ₹5 */,
          sortOrder: 1,
          ...by,
        },
      ])
      .returning();
    if (!latkan || !sticker) throw new Error("Option insert returned no rows");
    await tx.insert(s.customisationChoices).values(
      ["Gold", "Red", "Pink", "White"].map((name, sortOrder) => ({
        optionId: latkan.id,
        name,
        sortOrder,
        ...by,
      })),
    );
    await tx.insert(s.customisationOptionCategories).values([
      { optionId: latkan.id, categoryId: box.id, ...by },
      { optionId: sticker.id, categoryId: box.id, ...by },
      { optionId: sticker.id, categoryId: pouch.id, ...by },
    ]);

    // Products (§2.2). Sizes in mm, weights in g.
    const products = await tx
      .insert(s.products)
      .values([
        {
          sku: "BOX-SQ-RED-01",
          name: "Square Box – Red Floral",
          categoryId: box.id,
          typeId: item("product_type", "Square"),
          colourId: item("colour", "Red"),
          designId: item("design", "Floral"),
          lengthMm: 200,
          widthMm: 200,
          heightMm: 100,
          weightG: 350,
          price: 120_000 /* ₹1200 */,
          cost: 45_000 /* ₹450 */,
          ...by,
        },
        {
          sku: "BOX-HEX-GLD-01",
          name: "Hexagon Box – Gold Mandala",
          categoryId: box.id,
          typeId: item("product_type", "Hexagon"),
          colourId: item("colour", "Gold"),
          designId: item("design", "Mandala"),
          lengthMm: 250,
          widthMm: 250,
          heightMm: 120,
          weightG: 420,
          price: 165_000 /* ₹1650 */,
          cost: 60_000 /* ₹600 */,
          ...by,
        },
        {
          sku: "BOX-TRK-IVY-01",
          name: "Trunk Box – Ivory Zari",
          categoryId: box.id,
          typeId: item("product_type", "Trunk"),
          colourId: item("colour", "Ivory"),
          designId: item("design", "Zari border"),
          lengthMm: 300,
          widthMm: 200,
          heightMm: 180,
          weightG: 800,
          price: 249_950 /* ₹2499.50 */,
          cost: 95_000 /* ₹950 */,
          ...by,
        },
        {
          sku: "POUCH-EMR-01",
          name: "Potli Pouch – Emerald",
          categoryId: pouch.id,
          colourId: item("colour", "Emerald"),
          designId: item("design", "Plain"),
          weightG: 80,
          price: 35_000 /* ₹350 */,
          cost: 12_000 /* ₹120 */,
          ...by,
        },
      ])
      .returning({ id: s.products.id, categoryId: s.products.categoryId });
    await tx.insert(s.productCustomisationOptions).values(
      products.flatMap((p) =>
        p.categoryId === box.id
          ? [
              { productId: p.id, optionId: latkan.id, ...by },
              { productId: p.id, optionId: sticker.id, ...by },
            ]
          : [{ productId: p.id, optionId: sticker.id, ...by }],
      ),
    );

    // Customers (§2.1), numbered by the real counter so C-0001… continue correctly.
    for (const { city, state, pin, ...customer } of CUSTOMERS) {
      const [row] = await tx
        .insert(s.customers)
        .values({ ...customer, number: await nextCustomerNumber(tx), ...by })
        .returning({ id: s.customers.id });
      if (!row) throw new Error("Customer insert returned no row");
      await tx.insert(s.customerAddresses).values({
        customerId: row.id,
        line1: "12, Rose Apartments",
        line2: "MG Road",
        city,
        state,
        pin,
        isDefault: true,
        ...by,
      });
    }
  });
  return { loaded: true };
}
