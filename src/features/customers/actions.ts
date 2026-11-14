"use server";

import { and, asc, eq, ne, or } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { Executor } from "@/db/connect";
import { uniqueViolation } from "@/db/errors";
import { nextCustomerNumber } from "@/db/id-counters";
import { customerAddresses, customers } from "@/db/schema";
import { ActionError, assertFound, authedAction } from "@/lib/auth/action";
import { formatCustomerId } from "@/lib/ids";
import { customerName } from "./format";
import {
  addAddressSchema,
  addressIdSchema,
  createCustomerSchema,
  duplicateCheckSchema,
  instagramHandleSchema,
  mobileSchema,
  updateAddressSchema,
  updateCustomerSchema,
} from "./schema";

// Customers (§2.1, §3.3). Mobile and Instagram handle are unique: a duplicate is
// reported on its field with the customer who already has it. Every customer keeps at
// least one address, exactly one of them the default.

const CUSTOMER_GONE = "That customer no longer exists. Reload the page.";
const ADDRESS_GONE = "That address no longer exists. Reload the page.";

export type ExistingCustomer = { id: string; code: string; name: string };

export type Duplicates = {
  mobile?: ExistingCustomer;
  instagramHandle?: ExistingCustomer;
};

const CONTACT_CONSTRAINTS = new Set([
  "customers_mobile_unique",
  "customers_instagram_handle_unique",
]);

type ContactKeys = { mobile: string | null; instagramHandle: string | null };

/** Other customers who already have this mobile or handle (normalised values). */
async function findDuplicates(
  tx: Executor,
  { mobile, instagramHandle }: ContactKeys,
  excludeId?: string,
): Promise<Duplicates> {
  const matches = [
    mobile ? eq(customers.mobile, mobile) : undefined,
    instagramHandle
      ? eq(customers.instagramHandle, instagramHandle)
      : undefined,
  ].filter((c) => c !== undefined);
  if (matches.length === 0) return {};
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
    .where(
      and(or(...matches), excludeId ? ne(customers.id, excludeId) : undefined),
    );
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
 * Runs a save that may hit the mobile/handle unique constraints. A violation means
 * someone saved the same value between our check and the write: report it like the check.
 */
async function withDuplicateCheck<T>(
  keys: ContactKeys,
  excludeId: string | undefined,
  save: (tx: Executor) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const error = duplicateError(await findDuplicates(tx, keys, excludeId));
      if (error) throw error;
      return save(tx);
    });
  } catch (error) {
    // Only the mobile/handle constraints mean "someone else has it". Anything else (e.g.
    // a customer number clash if the counter fell behind) is a real error: let it be logged.
    if (CONTACT_CONSTRAINTS.has(uniqueViolation(error) ?? "")) {
      throw (
        duplicateError(await findDuplicates(db, keys, excludeId)) ??
        new ActionError(
          "This customer may already exist. Search for them first.",
        )
      );
    }
    throw error;
  }
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
    return findDuplicates(
      db,
      {
        mobile: mobile.success ? mobile.data : null,
        instagramHandle: handle.success ? handle.data : null,
      },
      input.excludeId,
    );
  },
);

/** Adds a customer with their first address (made the default), then opens their page. */
export const createCustomer = authedAction(
  createCustomerSchema,
  async (input, { audit }) => {
    const { line1, line2, landmark, city, state, pin, ...customer } = input;
    const id = await withDuplicateCheck(customer, undefined, async (tx) => {
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
        ...{ line1, line2, landmark, city, state, pin },
        isDefault: true,
        ...audit.create,
      });
      return row.id;
    });
    redirect(`/customers/${id}`);
  },
);

/** Saves a customer's own details, then goes back to their page. */
export const updateCustomer = authedAction(
  updateCustomerSchema,
  async ({ id, ...customer }, { audit }) => {
    await withDuplicateCheck(customer, id, async (tx) => {
      const rows = await tx
        .update(customers)
        .set({ ...customer, ...audit.update })
        .where(eq(customers.id, id))
        .returning({ id: customers.id });
      assertFound(rows, CUSTOMER_GONE);
    });
    redirect(`/customers/${id}`);
  },
);

/**
 * Locks the customer's row for the rest of the transaction, so address changes for one
 * customer happen one at a time (one default, never zero addresses). NO KEY UPDATE, so
 * rows that reference the customer (orders) can still be inserted meanwhile.
 */
async function lockCustomer(tx: Executor, customerId: string): Promise<void> {
  const rows = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .for("no key update");
  assertFound(rows, CUSTOMER_GONE);
}

/** The address's customer, with that customer locked; the address is re-read under the lock. */
async function lockAddress(tx: Executor, addressId: string) {
  const [before] = await tx
    .select({ customerId: customerAddresses.customerId })
    .from(customerAddresses)
    .where(eq(customerAddresses.id, addressId));
  if (!before) throw new ActionError(ADDRESS_GONE);
  await lockCustomer(tx, before.customerId);
  const [address] = await tx
    .select({
      customerId: customerAddresses.customerId,
      isDefault: customerAddresses.isDefault,
    })
    .from(customerAddresses)
    .where(eq(customerAddresses.id, addressId));
  if (!address) throw new ActionError(ADDRESS_GONE);
  return address;
}

async function clearDefault(
  tx: Executor,
  customerId: string,
  update: { updatedBy: string },
) {
  await tx
    .update(customerAddresses)
    .set({ isDefault: false, ...update })
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isDefault, true),
      ),
    );
}

/** Adds an address; it becomes the default if asked, or if it's the customer's first. */
export const addAddress = authedAction(
  addAddressSchema,
  async ({ customerId, makeDefault, ...address }, { audit }) => {
    await db.transaction(async (tx) => {
      await lockCustomer(tx, customerId);
      const existing = await tx.$count(
        customerAddresses,
        eq(customerAddresses.customerId, customerId),
      );
      const isDefault = makeDefault || existing === 0;
      if (isDefault) await clearDefault(tx, customerId, audit.update);
      await tx
        .insert(customerAddresses)
        .values({ customerId, ...address, isDefault, ...audit.create });
    });
    redirect(`/customers/${customerId}`);
  },
);

/** Changes an address. Orders keep the copy they were placed with. */
export const updateAddress = authedAction(
  updateAddressSchema,
  async ({ id, ...address }, { audit }) => {
    const rows = await db
      .update(customerAddresses)
      .set({ ...address, ...audit.update })
      .where(eq(customerAddresses.id, id))
      .returning({ customerId: customerAddresses.customerId });
    assertFound(rows, ADDRESS_GONE);
    redirect(`/customers/${rows[0]?.customerId}`);
  },
);

/** Makes this the customer's default address (the one new orders start with). */
export const setDefaultAddress = authedAction(
  addressIdSchema,
  async ({ id }, { audit }) => {
    await db.transaction(async (tx) => {
      const { customerId } = await lockAddress(tx, id);
      await clearDefault(tx, customerId, audit.update);
      await tx
        .update(customerAddresses)
        .set({ isDefault: true, ...audit.update })
        .where(eq(customerAddresses.id, id));
    });
    refresh();
  },
);

/**
 * Deletes an address (orders keep their own copy). A customer's only address can't be
 * deleted; deleting the default makes the oldest remaining one the default.
 */
export const deleteAddress = authedAction(
  addressIdSchema,
  async ({ id }, { audit }) => {
    await db.transaction(async (tx) => {
      const { customerId, isDefault } = await lockAddress(tx, id);
      const others = await tx
        .select({ id: customerAddresses.id })
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.customerId, customerId),
            ne(customerAddresses.id, id),
          ),
        )
        .orderBy(asc(customerAddresses.createdAt), asc(customerAddresses.id));
      const next = others[0];
      if (!next) {
        throw new ActionError(
          "A customer needs at least one address. Add another one first.",
        );
      }
      await tx.delete(customerAddresses).where(eq(customerAddresses.id, id));
      if (isDefault) {
        await tx
          .update(customerAddresses)
          .set({ isDefault: true, ...audit.update })
          .where(eq(customerAddresses.id, next.id));
      }
    });
    refresh();
  },
);
