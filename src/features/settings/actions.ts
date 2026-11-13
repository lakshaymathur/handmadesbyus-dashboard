"use server";

import { asc, eq, max } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db/client";
import { foreignKeyViolation, uniqueViolation } from "@/db/errors";
import {
  categories,
  deliveryPartners,
  listItems,
  productionStages,
} from "@/db/schema";
import { ActionError, authedAction } from "@/lib/auth/action";
import { moveInList } from "./reorder";
import {
  addCategorySchema,
  addListItemSchema,
  addStageSchema,
  deliveryPartnerSchema,
  FIRST_STAGE_NAME,
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

function assertFound(rows: unknown[]): void {
  if (rows.length === 0) throw new ActionError(GONE);
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
      const siblings = await tx
        .select({ id: listItems.id, position: listItems.sortOrder })
        .from(listItems)
        .where(eq(listItems.kind, item.kind))
        .orderBy(asc(listItems.sortOrder), asc(listItems.name))
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
      const siblings = await tx
        .select({
          id: deliveryPartners.id,
          position: deliveryPartners.sortOrder,
        })
        .from(deliveryPartners)
        .orderBy(asc(deliveryPartners.sortOrder), asc(deliveryPartners.name))
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
      const siblings = await tx
        .select({ id: categories.id, position: categories.sortOrder })
        .from(categories)
        .orderBy(asc(categories.sortOrder), asc(categories.name))
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
    .orderBy(asc(productionStages.position), asc(productionStages.name))
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
