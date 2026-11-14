"use server";

import { eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { Executor } from "@/db/connect";
import { uniqueViolation } from "@/db/errors";
import { nextCustomerNumber } from "@/db/id-counters";
import { customerAddresses, customers } from "@/db/schema";
import { ActionError, authedAction } from "@/lib/auth/action";
import { formatCustomerId } from "@/lib/ids";
import { customerName } from "./format";
import {
  createCustomerSchema,
  duplicateCheckSchema,
  instagramHandleSchema,
  mobileSchema,
} from "./schema";

// Customers (§2.1, §3.3). Mobile and Instagram handle are unique: a duplicate is
// reported on its field with the customer who already has it.

export type ExistingCustomer = { id: string; code: string; name: string };

export type Duplicates = {
  mobile?: ExistingCustomer;
  instagramHandle?: ExistingCustomer;
};

/** Customers who already have this mobile or handle (normalised values). */
async function findDuplicates(
  tx: Executor,
  {
    mobile,
    instagramHandle,
  }: { mobile: string | null; instagramHandle: string | null },
): Promise<Duplicates> {
  const conditions = [
    mobile ? eq(customers.mobile, mobile) : undefined,
    instagramHandle
      ? eq(customers.instagramHandle, instagramHandle)
      : undefined,
  ].filter((c) => c !== undefined);
  if (conditions.length === 0) return {};
  const rows = await tx
    .select({
      id: customers.id,
      number: customers.number,
      firstName: customers.firstName,
      lastName: customers.lastName,
      mobile: customers.mobile,
      instagramHandle: customers.instagramHandle,
    })
    .from(customers)
    .where(or(...conditions));
  const found: Duplicates = {};
  for (const row of rows) {
    const existing = {
      id: row.id,
      code: formatCustomerId(row.number),
      name: customerName(row),
    };
    if (mobile && row.mobile === mobile) found.mobile = existing;
    if (instagramHandle && row.instagramHandle === instagramHandle) {
      found.instagramHandle = existing;
    }
  }
  return found;
}

function duplicateError(found: Duplicates): ActionError | null {
  const fieldErrors: Record<string, string[]> = {};
  if (found.mobile) {
    fieldErrors.mobile = [
      `Already used by ${found.mobile.code} ${found.mobile.name}`,
    ];
  }
  if (found.instagramHandle) {
    fieldErrors.instagramHandle = [
      `Already used by ${found.instagramHandle.code} ${found.instagramHandle.name}`,
    ];
  }
  if (Object.keys(fieldErrors).length === 0) return null;
  return new ActionError("This customer may already exist.", fieldErrors);
}

/**
 * Who already has this mobile or handle, as the form is filled in (the spec's duplicate
 * warning). Values that aren't valid yet are ignored.
 */
export const checkCustomerDuplicates = authedAction(
  duplicateCheckSchema,
  async (input): Promise<Duplicates> => {
    const mobile = mobileSchema.safeParse(input.mobile);
    const handle = instagramHandleSchema.safeParse(input.instagramHandle);
    return findDuplicates(db, {
      mobile: mobile.success ? mobile.data : null,
      instagramHandle: handle.success ? handle.data : null,
    });
  },
);

/** Adds a customer with their first address (made the default), then opens their page. */
export const createCustomer = authedAction(
  createCustomerSchema,
  async (input, { audit }) => {
    const { line1, line2, landmark, city, state, pin, ...customer } = input;
    let id: string;
    try {
      id = await db.transaction(async (tx) => {
        const error = duplicateError(await findDuplicates(tx, customer));
        if (error) throw error;
        const [row] = await tx
          .insert(customers)
          .values({
            ...customer,
            number: await nextCustomerNumber(tx),
            ...audit.create,
          })
          .returning({ id: customers.id });
        if (!row) throw new Error("Customer insert returned no row");
        await tx.insert(customerAddresses).values({
          customerId: row.id,
          line1,
          line2,
          landmark,
          city,
          state,
          pin,
          isDefault: true,
          ...audit.create,
        });
        return row.id;
      });
    } catch (error) {
      // Someone saved the same mobile or handle between our check and the insert.
      if (uniqueViolation(error) !== null) {
        throw (
          duplicateError(await findDuplicates(db, input)) ??
          new ActionError(
            "This customer may already exist. Search for them first.",
          )
        );
      }
      throw error;
    }
    redirect(`/customers/${id}`);
  },
);
