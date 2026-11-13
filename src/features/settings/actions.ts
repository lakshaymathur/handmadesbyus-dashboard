"use server";

import { asc, eq, max } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db/client";
import { uniqueViolation } from "@/db/errors";
import { deliveryPartners, listItems } from "@/db/schema";
import { ActionError, authedAction } from "@/lib/auth/action";
import { moveInList } from "./reorder";
import {
  addListItemSchema,
  deliveryPartnerSchema,
  moveSchema,
  renameListItemSchema,
  setActiveSchema,
  updateDeliveryPartnerSchema,
} from "./schema";

// Managed lists (product types, colours, designs, aggregators) and delivery partners.
// Entries are deactivated, never deleted: products and shipments refer to them.

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
  renameListItemSchema,
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
        .select({ id: listItems.id, sortOrder: listItems.sortOrder })
        .from(listItems)
        .where(eq(listItems.kind, item.kind))
        .orderBy(asc(listItems.sortOrder), asc(listItems.name))
        .for("update");
      const order = moveInList(
        siblings.map((s) => s.id),
        id,
        direction,
      );
      if (!order) return;
      // Renumber 0..n so ties from older rows can't make the move a no-op.
      for (const [position, rowId] of order.entries()) {
        if (siblings.find((s) => s.id === rowId)?.sortOrder === position)
          continue;
        await tx
          .update(listItems)
          .set({ sortOrder: position, ...audit.update })
          .where(eq(listItems.id, rowId));
      }
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
          sortOrder: deliveryPartners.sortOrder,
        })
        .from(deliveryPartners)
        .orderBy(asc(deliveryPartners.sortOrder), asc(deliveryPartners.name))
        .for("update");
      if (!siblings.some((s) => s.id === id)) throw new ActionError(GONE);
      const order = moveInList(
        siblings.map((s) => s.id),
        id,
        direction,
      );
      if (!order) return;
      for (const [position, rowId] of order.entries()) {
        if (siblings.find((s) => s.id === rowId)?.sortOrder === position)
          continue;
        await tx
          .update(deliveryPartners)
          .set({ sortOrder: position, ...audit.update })
          .where(eq(deliveryPartners.id, rowId));
      }
    });
    refresh();
  },
);
