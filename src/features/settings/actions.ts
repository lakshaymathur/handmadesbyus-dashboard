"use server";

import { asc, eq, max } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { lockList } from "@/db/locks";
import { byName } from "@/db/order";
import { foreignKeyViolation, uniqueViolation } from "@/db/errors";
import {
  appSettings,
  categories,
  customisationChoices,
  customisationOptionCategories,
  customisationOptions,
  deliveryPartners,
  listItems,
  productionStages,
} from "@/db/schema";
import { ActionError, assertFound, authedAction } from "@/lib/auth/action";
import { moveInList } from "./reorder";
import {
  addCategorySchema,
  addChoiceSchema,
  customisationOptionSchema,
  updateCustomisationOptionSchema,
  addListItemSchema,
  addStageSchema,
  deliveryPartnerSchema,
  FIRST_STAGE_NAME,
  generalSettingsSchema,
  idSchema,
  moveSchema,
  renameSchema,
  setActiveSchema,
  updateDeliveryPartnerSchema,
  type MoveDirection,
} from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Settings (§3.7): managed lists (product types, colours, designs, aggregators), delivery
// partners, and categories with their production stages. List entries, partners and
// categories are deactivated, never deleted: products and shipments refer to them.

const GONE = "That entry no longer exists. Reload the page.";

/** Runs `write`, turning a duplicate-name violation into a message on the name field. */
async function saveName(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (uniqueViolation(error) !== null) {
      throw new ActionError("That name is already in the list.", {
        name: ["Already in the list"],
      });
    }
    throw error;
  }
}

/**
 * Moves `id` one place within `siblings` (locked, in display order), then renumbers
 * everything 0..n with `write`, so ties left by older rows can't make the move a no-op.
 */
async function applyMove(
  siblings: { id: string; position: number }[],
  id: string,
  direction: MoveDirection,
  write: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
  if (!siblings.some((s) => s.id === id)) throw new ActionError(GONE);
  const order = moveInList(
    siblings.map((s) => s.id),
    id,
    direction,
  );
  if (!order) return;
  for (const [position, rowId] of order.entries()) {
    if (siblings.find((s) => s.id === rowId)?.position === position) continue;
    await write(rowId, position);
  }
}

// --- Managed lists -------------------------------------------------------------

export const addListItem = authedAction(
  addListItemSchema,
  async ({ kind, name }, { audit }) => {
    await saveName(() =>
      db.transaction(async (tx) => {
        await lockList(tx, `list_items:${kind}`);
        const [last] = await tx
          .select({ value: max(listItems.sortOrder) })
          .from(listItems)
          .where(eq(listItems.kind, kind));
        await tx.insert(listItems).values({
          kind,
          name,
          sortOrder: (last?.value ?? -1) + 1,
          ...audit.create,
        });
      }),
    );
    refresh();
  },
);

export const renameListItem = authedAction(
  renameSchema,
  async ({ id, name }, { audit }) => {
    await saveName(async () =>
      assertFound(
        await db
          .update(listItems)
          .set({ name, ...audit.update })
          .where(eq(listItems.id, id))
          .returning({ id: listItems.id }),
      ),
    );
    refresh();
  },
);

export const setListItemActive = authedAction(
  setActiveSchema,
  async ({ id, active }, { audit }) => {
    assertFound(
      await db
        .update(listItems)
        .set({ active, ...audit.update })
        .where(eq(listItems.id, id))
        .returning({ id: listItems.id }),
    );
    refresh();
  },
);

export const moveListItem = authedAction(
  moveSchema,
  async ({ id, direction }, { audit }) => {
    await db.transaction(async (tx) => {
      const [item] = await tx
        .select({ kind: listItems.kind })
        .from(listItems)
        .where(eq(listItems.id, id));
      if (!item) throw new ActionError(GONE);
      await lockList(tx, `list_items:${item.kind}`);
      const siblings = await tx
        .select({ id: listItems.id, position: listItems.sortOrder })
        .from(listItems)
        .where(eq(listItems.kind, item.kind))
        .orderBy(asc(listItems.sortOrder), byName(listItems.name))
        .for("update");
      await applyMove(siblings, id, direction, (rowId, position) =>
        tx
          .update(listItems)
          .set({ sortOrder: position, ...audit.update })
          .where(eq(listItems.id, rowId)),
      );
    });
    refresh();
  },
);

// --- Delivery partners ---------------------------------------------------------

export const addDeliveryPartner = authedAction(
  deliveryPartnerSchema,
  async ({ name, trackingUrlTemplate }, { audit }) => {
    await saveName(() =>
      db.transaction(async (tx) => {
        await lockList(tx, "delivery_partners");
        const [last] = await tx
          .select({ value: max(deliveryPartners.sortOrder) })
          .from(deliveryPartners);
        await tx.insert(deliveryPartners).values({
          name,
          trackingUrlTemplate,
          sortOrder: (last?.value ?? -1) + 1,
          ...audit.create,
        });
      }),
    );
    refresh();
  },
);

export const updateDeliveryPartner = authedAction(
  updateDeliveryPartnerSchema,
  async ({ id, name, trackingUrlTemplate }, { audit }) => {
    await saveName(async () =>
      assertFound(
        await db
          .update(deliveryPartners)
          .set({ name, trackingUrlTemplate, ...audit.update })
          .where(eq(deliveryPartners.id, id))
          .returning({ id: deliveryPartners.id }),
      ),
    );
    refresh();
  },
);

export const setDeliveryPartnerActive = authedAction(
  setActiveSchema,
  async ({ id, active }, { audit }) => {
    assertFound(
      await db
        .update(deliveryPartners)
        .set({ active, ...audit.update })
        .where(eq(deliveryPartners.id, id))
        .returning({ id: deliveryPartners.id }),
    );
    refresh();
  },
);

export const moveDeliveryPartner = authedAction(
  moveSchema,
  async ({ id, direction }, { audit }) => {
    await db.transaction(async (tx) => {
      await lockList(tx, "delivery_partners");
      const siblings = await tx
        .select({
          id: deliveryPartners.id,
          position: deliveryPartners.sortOrder,
        })
        .from(deliveryPartners)
        .orderBy(asc(deliveryPartners.sortOrder), byName(deliveryPartners.name))
        .for("update");
      await applyMove(siblings, id, direction, (rowId, position) =>
        tx
          .update(deliveryPartners)
          .set({ sortOrder: position, ...audit.update })
          .where(eq(deliveryPartners.id, rowId)),
      );
    });
    refresh();
  },
);

// --- Categories and production stages (§2.6) -------------------------------------
// Categories deactivate (products refer to them). Stages can be deleted unless order
// items or status history use them (the foreign keys refuse it), and a category always
// keeps at least one stage.

export const addCategory = authedAction(
  addCategorySchema,
  async ({ name }, { audit }) => {
    await saveName(() =>
      db.transaction(async (tx) => {
        await lockList(tx, "categories");
        const [last] = await tx
          .select({ value: max(categories.sortOrder) })
          .from(categories);
        const [category] = await tx
          .insert(categories)
          .values({ name, sortOrder: (last?.value ?? -1) + 1, ...audit.create })
          .returning({ id: categories.id });
        if (!category) throw new Error("Category insert returned no row");
        await tx.insert(productionStages).values({
          categoryId: category.id,
          name: FIRST_STAGE_NAME,
          position: 0,
          ...audit.create,
        });
      }),
    );
    refresh();
  },
);

export const renameCategory = authedAction(
  renameSchema,
  async ({ id, name }, { audit }) => {
    await saveName(async () =>
      assertFound(
        await db
          .update(categories)
          .set({ name, ...audit.update })
          .where(eq(categories.id, id))
          .returning({ id: categories.id }),
      ),
    );
    refresh();
  },
);

export const setCategoryActive = authedAction(
  setActiveSchema,
  async ({ id, active }, { audit }) => {
    assertFound(
      await db
        .update(categories)
        .set({ active, ...audit.update })
        .where(eq(categories.id, id))
        .returning({ id: categories.id }),
    );
    refresh();
  },
);

export const moveCategory = authedAction(
  moveSchema,
  async ({ id, direction }, { audit }) => {
    await db.transaction(async (tx) => {
      await lockList(tx, "categories");
      const siblings = await tx
        .select({ id: categories.id, position: categories.sortOrder })
        .from(categories)
        .orderBy(asc(categories.sortOrder), byName(categories.name))
        .for("update");
      await applyMove(siblings, id, direction, (rowId, position) =>
        tx
          .update(categories)
          .set({ sortOrder: position, ...audit.update })
          .where(eq(categories.id, rowId)),
      );
    });
    refresh();
  },
);

/** Locks a category's stages (in order) for the rest of the transaction. */
function lockStages(tx: Transaction, categoryId: string) {
  return tx
    .select({ id: productionStages.id, position: productionStages.position })
    .from(productionStages)
    .where(eq(productionStages.categoryId, categoryId))
    .orderBy(asc(productionStages.position), byName(productionStages.name))
    .for("update");
}

export const addStage = authedAction(
  addStageSchema,
  async ({ categoryId, name }, { audit }) => {
    await saveName(() =>
      db.transaction(async (tx) => {
        const [category] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, categoryId))
          .for("update");
        if (!category) throw new ActionError(GONE);
        const stages = await lockStages(tx, categoryId);
        await tx.insert(productionStages).values({
          categoryId,
          name,
          position: Math.max(-1, ...stages.map((s) => s.position)) + 1,
          ...audit.create,
        });
      }),
    );
    refresh();
  },
);

export const renameStage = authedAction(
  renameSchema,
  async ({ id, name }, { audit }) => {
    await saveName(async () =>
      assertFound(
        await db
          .update(productionStages)
          .set({ name, ...audit.update })
          .where(eq(productionStages.id, id))
          .returning({ id: productionStages.id }),
      ),
    );
    refresh();
  },
);

export const moveStage = authedAction(
  moveSchema,
  async ({ id, direction }, { audit }) => {
    await db.transaction(async (tx) => {
      const [stage] = await tx
        .select({ categoryId: productionStages.categoryId })
        .from(productionStages)
        .where(eq(productionStages.id, id));
      if (!stage) throw new ActionError(GONE);
      const siblings = await lockStages(tx, stage.categoryId);
      await applyMove(siblings, id, direction, (rowId, position) =>
        tx
          .update(productionStages)
          .set({ position, ...audit.update })
          .where(eq(productionStages.id, rowId)),
      );
    });
    refresh();
  },
);

export const deleteStage = authedAction(idSchema, async ({ id }) => {
  try {
    await db.transaction(async (tx) => {
      const [stage] = await tx
        .select({ categoryId: productionStages.categoryId })
        .from(productionStages)
        .where(eq(productionStages.id, id));
      if (!stage) throw new ActionError(GONE);
      const stages = await lockStages(tx, stage.categoryId);
      if (stages.length <= 1) {
        throw new ActionError(
          "A category needs at least one stage. Rename this one instead.",
        );
      }
      await tx.delete(productionStages).where(eq(productionStages.id, id));
    });
  } catch (error) {
    if (foreignKeyViolation(error) !== null) {
      throw new ActionError(
        "Orders use this stage, so it can't be deleted. Rename it instead.",
      );
    }
    throw error;
  }
  refresh();
});

// --- Customisation options (§2.3) --------------------------------------------------
// Options and their choices deactivate (order items keep pointing at them). Price and
// cost changes only affect new orders: order items snapshot them.

type OptionValues = {
  name: string;
  inputType: "none" | "text" | "choice";
  maxLength: number | null;
  extraPrice: number;
  extraCost: number;
};

/** Replaces the option's categories. A category deleted meanwhile is a 23503. */
async function setOptionCategories(
  tx: Transaction,
  optionId: string,
  categoryIds: string[],
  createdBy: { createdBy: string; updatedBy: string },
): Promise<void> {
  await tx
    .delete(customisationOptionCategories)
    .where(eq(customisationOptionCategories.optionId, optionId));
  if (categoryIds.length === 0) return;
  await tx
    .insert(customisationOptionCategories)
    .values(
      categoryIds.map((categoryId) => ({ optionId, categoryId, ...createdBy })),
    );
}

/** saveName, plus a clear message if a picked category no longer exists. */
async function saveOption(write: () => Promise<unknown>): Promise<void> {
  try {
    await saveName(write);
  } catch (error) {
    if (foreignKeyViolation(error) !== null) {
      throw new ActionError(
        "One of the categories no longer exists. Reload the page.",
      );
    }
    throw error;
  }
}

export const createCustomisationOption = authedAction(
  customisationOptionSchema,
  async ({ categoryIds, ...values }, { audit }) => {
    let id = "";
    await saveOption(() =>
      db.transaction(async (tx) => {
        await lockList(tx, "customisation_options");
        const [last] = await tx
          .select({ value: max(customisationOptions.sortOrder) })
          .from(customisationOptions);
        const [option] = await tx
          .insert(customisationOptions)
          .values({
            ...(values satisfies OptionValues),
            sortOrder: (last?.value ?? -1) + 1,
            ...audit.create,
          })
          .returning({ id: customisationOptions.id });
        if (!option) throw new Error("Option insert returned no row");
        id = option.id;
        await setOptionCategories(tx, id, categoryIds, audit.create);
      }),
    );
    // On to the option's page, where choices are added.
    redirect(`/settings/customisations/${id}`);
  },
);

export const updateCustomisationOption = authedAction(
  updateCustomisationOptionSchema,
  async ({ id, categoryIds, ...values }, { audit }) => {
    await saveOption(() =>
      db.transaction(async (tx) => {
        assertFound(
          await tx
            .update(customisationOptions)
            .set({ ...(values satisfies OptionValues), ...audit.update })
            .where(eq(customisationOptions.id, id))
            .returning({ id: customisationOptions.id }),
        );
        await setOptionCategories(tx, id, categoryIds, audit.create);
      }),
    );
    refresh();
  },
);

export const setCustomisationOptionActive = authedAction(
  setActiveSchema,
  async ({ id, active }, { audit }) => {
    assertFound(
      await db
        .update(customisationOptions)
        .set({ active, ...audit.update })
        .where(eq(customisationOptions.id, id))
        .returning({ id: customisationOptions.id }),
    );
    refresh();
  },
);

export const moveCustomisationOption = authedAction(
  moveSchema,
  async ({ id, direction }, { audit }) => {
    await db.transaction(async (tx) => {
      await lockList(tx, "customisation_options");
      const siblings = await tx
        .select({
          id: customisationOptions.id,
          position: customisationOptions.sortOrder,
        })
        .from(customisationOptions)
        .orderBy(
          asc(customisationOptions.sortOrder),
          byName(customisationOptions.name),
        )
        .for("update");
      await applyMove(siblings, id, direction, (rowId, position) =>
        tx
          .update(customisationOptions)
          .set({ sortOrder: position, ...audit.update })
          .where(eq(customisationOptions.id, rowId)),
      );
    });
    refresh();
  },
);

function lockChoices(tx: Transaction, optionId: string) {
  return tx
    .select({
      id: customisationChoices.id,
      position: customisationChoices.sortOrder,
    })
    .from(customisationChoices)
    .where(eq(customisationChoices.optionId, optionId))
    .orderBy(
      asc(customisationChoices.sortOrder),
      byName(customisationChoices.name),
    )
    .for("update");
}

export const addChoice = authedAction(
  addChoiceSchema,
  async ({ optionId, name }, { audit }) => {
    await saveName(() =>
      db.transaction(async (tx) => {
        const [option] = await tx
          .select({ id: customisationOptions.id })
          .from(customisationOptions)
          .where(eq(customisationOptions.id, optionId))
          .for("update");
        if (!option) throw new ActionError(GONE);
        const choices = await lockChoices(tx, optionId);
        await tx.insert(customisationChoices).values({
          optionId,
          name,
          sortOrder: Math.max(-1, ...choices.map((c) => c.position)) + 1,
          ...audit.create,
        });
      }),
    );
    refresh();
  },
);

export const renameChoice = authedAction(
  renameSchema,
  async ({ id, name }, { audit }) => {
    await saveName(async () =>
      assertFound(
        await db
          .update(customisationChoices)
          .set({ name, ...audit.update })
          .where(eq(customisationChoices.id, id))
          .returning({ id: customisationChoices.id }),
      ),
    );
    refresh();
  },
);

export const setChoiceActive = authedAction(
  setActiveSchema,
  async ({ id, active }, { audit }) => {
    assertFound(
      await db
        .update(customisationChoices)
        .set({ active, ...audit.update })
        .where(eq(customisationChoices.id, id))
        .returning({ id: customisationChoices.id }),
    );
    refresh();
  },
);

export const moveChoice = authedAction(
  moveSchema,
  async ({ id, direction }, { audit }) => {
    await db.transaction(async (tx) => {
      const [choice] = await tx
        .select({ optionId: customisationChoices.optionId })
        .from(customisationChoices)
        .where(eq(customisationChoices.id, id));
      if (!choice) throw new ActionError(GONE);
      const siblings = await lockChoices(tx, choice.optionId);
      await applyMove(siblings, id, direction, (rowId, position) =>
        tx
          .update(customisationChoices)
          .set({ sortOrder: position, ...audit.update })
          .where(eq(customisationChoices.id, rowId)),
      );
    });
    refresh();
  },
);

// --- General settings ---------------------------------------------------------------

export const updateGeneralSettings = authedAction(
  generalSettingsSchema,
  async ({ dueSoonDays }, { audit }) => {
    // app_settings has one row (id = 1); the first save creates it.
    await db
      .insert(appSettings)
      .values({ id: 1, dueSoonDays, ...audit.create })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { dueSoonDays, ...audit.update },
      });
    refresh();
  },
);
