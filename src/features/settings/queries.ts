import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryPartners, listItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { ListKind } from "./schema";

export type ManagedItem = {
  id: string;
  name: string;
  active: boolean;
  detail: string | null;
};

/** One managed list (types, colours, …) in display order, inactive entries included. */
export async function getListItems(kind: ListKind): Promise<ManagedItem[]> {
  await requireUser();
  const rows = await db
    .select({
      id: listItems.id,
      name: listItems.name,
      active: listItems.active,
    })
    .from(listItems)
    .where(eq(listItems.kind, kind))
    .orderBy(asc(listItems.sortOrder), asc(listItems.name));
  return rows.map((row) => ({ ...row, detail: null }));
}

/** Delivery partners in display order; `detail` is the tracking URL template. */
export async function getDeliveryPartners(): Promise<ManagedItem[]> {
  await requireUser();
  return db
    .select({
      id: deliveryPartners.id,
      name: deliveryPartners.name,
      active: deliveryPartners.active,
      detail: deliveryPartners.trackingUrlTemplate,
    })
    .from(deliveryPartners)
    .orderBy(asc(deliveryPartners.sortOrder), asc(deliveryPartners.name));
}
