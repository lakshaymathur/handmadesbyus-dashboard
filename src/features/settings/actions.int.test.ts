import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { deliveryPartners, listItems } from "@/db/schema";
import { signInTestUser, signOutTestUser } from "@/db/test/session";
import {
  addDeliveryPartner,
  addListItem,
  moveDeliveryPartner,
  moveListItem,
  renameListItem,
  setListItemActive,
  updateDeliveryPartner,
} from "./actions";
import { getDeliveryPartners, getListItems } from "./queries";

let userId: string;

beforeEach(async () => {
  vi.mocked(refresh).mockClear();
  ({ userId } = await signInTestUser());
});

const names = async (kind: "colour" | "design") =>
  (await getListItems(kind)).map((i) => i.name);

async function addColours(...colours: string[]) {
  for (const name of colours) {
    expect(await addListItem({ kind: "colour", name })).toEqual({
      ok: true,
      data: undefined,
    });
  }
  return db
    .select()
    .from(listItems)
    .where(eq(listItems.kind, "colour"))
    .orderBy(asc(listItems.sortOrder));
}

describe("managed lists", () => {
  it("requires a signed-in user", async () => {
    signOutTestUser();
    await expect(
      addListItem({ kind: "colour", name: "Red" }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });

  it("adds entries at the end, tidying spaces, and refreshes the page", async () => {
    const rows = await addColours("  Dark   Red ", "Gold");
    expect(rows.map((r) => [r.name, r.sortOrder])).toEqual([
      ["Dark Red", 0],
      ["Gold", 1],
    ]);
    expect(rows[0]).toMatchObject({ createdBy: userId, updatedBy: userId });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps each list separate", async () => {
    await addColours("Red");
    await addListItem({ kind: "design", name: "Red" });
    expect(await names("colour")).toEqual(["Red"]);
    expect(await names("design")).toEqual(["Red"]);
  });

  it("rejects a name already in the list, ignoring case", async () => {
    await addColours("Red");
    expect(await addListItem({ kind: "colour", name: "RED" })).toEqual({
      ok: false,
      error: "That name is already in the list.",
      fieldErrors: { name: ["Already in the list"] },
    });
    const gold = (await addColours("Gold")).find((r) => r.name === "Gold");
    expect(await renameListItem({ id: gold!.id, name: "red" })).toMatchObject({
      ok: false,
      fieldErrors: { name: ["Already in the list"] },
    });
    // Changing only the case of its own name is fine.
    expect(await renameListItem({ id: gold!.id, name: "GOLD" })).toMatchObject({
      ok: true,
    });
  });

  it("validates input on the server too", async () => {
    expect(await addListItem({ kind: "colour", name: "   " })).toMatchObject({
      ok: false,
      fieldErrors: { name: ["Enter a name"] },
    });
    expect(
      // @ts-expect-error -- a kind the form can't send
      await addListItem({ kind: "users", name: "x" }),
    ).toMatchObject({ ok: false, fieldErrors: { kind: expect.any(Array) } });
  });

  it("deactivates and reactivates, recording who did it", async () => {
    const [red] = await addColours("Red");
    const { userId: other } = await signInTestUser("ravi");
    await setListItemActive({ id: red!.id, active: false });
    const [row] = await db
      .select()
      .from(listItems)
      .where(eq(listItems.id, red!.id));
    expect(row).toMatchObject({
      active: false,
      createdBy: userId,
      updatedBy: other,
    });
    await setListItemActive({ id: red!.id, active: true });
    expect((await getListItems("colour"))[0]?.active).toBe(true);
  });

  it("moves entries up and down, and ignores moves past the ends", async () => {
    const [red, gold, blue] = await addColours("Red", "Gold", "Blue");
    await moveListItem({ id: blue!.id, direction: "up" });
    expect(await names("colour")).toEqual(["Red", "Blue", "Gold"]);
    await moveListItem({ id: red!.id, direction: "down" });
    expect(await names("colour")).toEqual(["Blue", "Red", "Gold"]);
    expect(await moveListItem({ id: gold!.id, direction: "down" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await names("colour")).toEqual(["Blue", "Red", "Gold"]);
  });

  it("reports entries that no longer exist", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    for (const result of [
      await renameListItem({ id: missing, name: "X" }),
      await setListItemActive({ id: missing, active: false }),
      await moveListItem({ id: missing, direction: "up" }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringMatching(/no longer exists/),
      });
    }
  });
});

describe("delivery partners", () => {
  it("stores a tracking link with {awb}, or none", async () => {
    await addDeliveryPartner({
      name: "Delhivery",
      trackingUrlTemplate: " https://www.delhivery.com/track/package/{awb} ",
    });
    await addDeliveryPartner({ name: "India Post", trackingUrlTemplate: "" });
    expect(await getDeliveryPartners()).toMatchObject([
      {
        name: "Delhivery",
        detail: "https://www.delhivery.com/track/package/{awb}",
      },
      { name: "India Post", detail: null },
    ]);
  });

  it("explains a tracking link without {awb} or with a bad scheme", async () => {
    expect(
      await addDeliveryPartner({
        name: "DTDC",
        trackingUrlTemplate: "https://www.dtdc.in/tracking",
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        trackingUrlTemplate: ["Put {awb} where the AWB number goes"],
      },
    });
    expect(
      await addDeliveryPartner({
        name: "DTDC",
        trackingUrlTemplate: "javascript:alert({awb})",
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { trackingUrlTemplate: expect.any(Array) },
    });
  });

  it("updates, rejects duplicates and reorders", async () => {
    await addDeliveryPartner({ name: "Delhivery", trackingUrlTemplate: "" });
    await addDeliveryPartner({ name: "DTDC", trackingUrlTemplate: "" });
    const [delhivery, dtdc] = await db
      .select()
      .from(deliveryPartners)
      .orderBy(asc(deliveryPartners.sortOrder));
    expect(
      await updateDeliveryPartner({
        id: dtdc!.id,
        name: "delhivery",
        trackingUrlTemplate: "",
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { name: ["Already in the list"] },
    });
    await updateDeliveryPartner({
      id: dtdc!.id,
      name: "DTDC Express",
      trackingUrlTemplate: "https://www.dtdc.in/track?awb={awb}",
    });
    await moveDeliveryPartner({ id: delhivery!.id, direction: "down" });
    expect((await getDeliveryPartners()).map((p) => p.name)).toEqual([
      "DTDC Express",
      "Delhivery",
    ]);
  });
});
