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
  addChoice,
  createCustomisationOption,
  moveChoice,
  setChoiceActive,
  updateCustomisationOption,
} from "./actions";
import {
  getCategories,
  getCustomisationOption,
  getCustomisationOptions,
} from "./queries";
import type { CustomisationOptionInput } from "./schema";

beforeEach(async () => {
  await signInTestUser();
});

const latkan: CustomisationOptionInput = {
  name: "Latkan",
  inputType: "choice",
  maxLength: "",
  extraPrice: "50",
  extraCost: "20",
  categoryIds: [],
};

/** Creates an option; the action redirects to its page, so read the id from there. */
async function create(input: CustomisationOptionInput): Promise<string> {
  const error = await createCustomisationOption(input).then(
    (result) => {
      throw new Error(`Expected a redirect, got ${JSON.stringify(result)}`);
    },
    (e: unknown) => e,
  );
  const digest = String((error as { digest?: unknown }).digest);
  const id = /\/settings\/customisations\/([0-9a-f-]{36})/.exec(digest)?.[1];
  if (!id) throw error;
  return id;
}

async function categoryIds(...names: string[]) {
  for (const name of names) await addCategory({ name });
  const all = await getCategories();
  return names.map((n) => all.find((c) => c.name === n)!.id);
}

describe("customisation options", () => {
  it("creates an option with prices in paise and its categories, then opens it", async () => {
    const [box, pouch] = await categoryIds("Box", "Pouch");
    const id = await create({ ...latkan, categoryIds: [box!, pouch!] });
    expect(await getCustomisationOption(id)).toMatchObject({
      name: "Latkan",
      inputType: "choice",
      maxLength: null,
      extraPrice: 5000,
      extraCost: 2000,
      categoryIds: expect.arrayContaining([box, pouch]),
    });
    expect(await getCustomisationOptions()).toMatchObject([
      {
        name: "Latkan",
        detail: "Choice from a list · +₹50 (cost ₹20) · Box, Pouch",
        href: `/settings/customisations/${id}`,
      },
    ]);
  });

  it("updates fields and replaces the categories", async () => {
    const [box, pouch] = await categoryIds("Box", "Pouch");
    const id = await create({ ...latkan, categoryIds: [box!] });
    expect(
      await updateCustomisationOption({
        id,
        name: "Sticker",
        inputType: "text",
        maxLength: "25",
        extraPrice: "30.50",
        extraCost: "5",
        categoryIds: [pouch!],
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(await getCustomisationOption(id)).toMatchObject({
      name: "Sticker",
      inputType: "text",
      maxLength: 25,
      extraPrice: 3050,
      extraCost: 500,
      categoryIds: [pouch],
    });
  });

  it("rejects a duplicate name and a category that doesn't exist", async () => {
    await create(latkan);
    expect(
      await createCustomisationOption({ ...latkan, name: "LATKAN" }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { name: ["Already in the list"] },
    });
    expect(
      await createCustomisationOption({
        ...latkan,
        name: "Sticker",
        categoryIds: ["00000000-0000-4000-8000-000000000000"],
      }),
    ).toEqual({
      ok: false,
      error: "One of the categories no longer exists. Reload the page.",
    });
    // The failed create left nothing behind.
    expect(await db.$count(s.customisationOptions)).toBe(1);
  });
});

describe("choices", () => {
  it("are added in order, reordered, deactivated and unique per option", async () => {
    const latkanId = await create(latkan);
    const otherId = await create({ ...latkan, name: "Tassel" });
    for (const name of ["Gold", "Red", "Pink"]) {
      await addChoice({ optionId: latkanId, name });
    }
    expect(await addChoice({ optionId: latkanId, name: "gold" })).toMatchObject(
      { ok: false, fieldErrors: { name: ["Already in the list"] } },
    );
    // Same name under another option is fine.
    expect(await addChoice({ optionId: otherId, name: "Gold" })).toMatchObject({
      ok: true,
    });

    const choices = (await getCustomisationOption(latkanId))!.choices;
    const pink = choices.find((c) => c.name === "Pink")!;
    await moveChoice({ id: pink.id, direction: "up" });
    await setChoiceActive({ id: pink.id, active: false });
    expect(
      (await getCustomisationOption(latkanId))!.choices.map((c) => [
        c.name,
        c.active,
      ]),
    ).toEqual([
      ["Gold", true],
      ["Pink", false],
      ["Red", true],
    ]);
    const [row] = await db
      .select()
      .from(s.customisationChoices)
      .where(eq(s.customisationChoices.id, pink.id));
    expect(row?.optionId).toBe(latkanId);
  });
});
