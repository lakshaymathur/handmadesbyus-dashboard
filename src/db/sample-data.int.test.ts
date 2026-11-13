import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { formatCustomerId } from "@/lib/ids";
import { db } from "./client";
import { nextCustomerNumber } from "./id-counters";
import { seedSampleData } from "./sample-data";
import * as s from "./schema";
import { createUserWithPassword } from "./users";

async function admin() {
  return (
    await createUserWithPassword(db, {
      username: "admin",
      name: "Admin",
      password: "correct-horse-battery",
    })
  ).id;
}

describe("sample data", () => {
  it("loads a consistent catalogue and customers that pass every constraint", async () => {
    expect(await seedSampleData(db, await admin())).toEqual({ loaded: true });
    expect({
      categories: await db.$count(s.categories),
      stages: await db.$count(s.productionStages),
      listItems: await db.$count(s.listItems),
      partners: await db.$count(s.deliveryPartners),
      options: await db.$count(s.customisationOptions),
      choices: await db.$count(s.customisationChoices),
      products: await db.$count(s.products),
      customers: await db.$count(s.customers),
      addresses: await db.$count(s.customerAddresses),
    }).toEqual({
      categories: 2,
      stages: 7,
      listItems: 14,
      partners: 4,
      options: 2,
      choices: 4,
      products: 4,
      customers: 3,
      addresses: 3,
    });
    // Customer numbers come from the real counter, so new customers continue from C-0004.
    const numbers = await db
      .select({ number: s.customers.number })
      .from(s.customers)
      .orderBy(asc(s.customers.number));
    expect(numbers.map((c) => formatCustomerId(c.number))).toEqual([
      "C-0001",
      "C-0002",
      "C-0003",
    ]);
    expect(await nextCustomerNumber(db)).toBe(4);
  });

  it("does nothing the second time", async () => {
    const userId = await admin();
    await seedSampleData(db, userId);
    expect(await seedSampleData(db, userId)).toEqual({ loaded: false });
    expect(await db.$count(s.products)).toBe(4);
  });
});
