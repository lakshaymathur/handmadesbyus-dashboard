import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { customerAddresses, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { formatCustomerId, parseCustomerId } from "@/lib/ids";
import { customerName } from "./format";
import { mobileSearchDigits, normalizeInstagramHandle } from "./schema";
import type { CustomerSource } from "./schema";

/** How many customers the list shows at once; search narrows it down. */
export const CUSTOMER_LIST_LIMIT = 100;

export type CustomerSummary = {
  id: string;
  code: string;
  name: string;
  mobile: string;
  instagramHandle: string | null;
  city: string | null;
};

/** Escapes LIKE wildcards so "50%" or "a_b" match literally. */
function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * What a search box query matches: a customer ID ("C-0012", "c12"), a mobile number or
 * part of one (spaces and +91 ignored), or part of a name or Instagram handle.
 */
export function customerSearchCondition(query: string): SQL | undefined {
  const q = query.trim();
  if (q === "") return undefined;

  const number = parseCustomerId(q);
  if (number !== null) return eq(customers.number, number);

  if (/^[\d\s+()-]+$/.test(q)) {
    const digits = mobileSearchDigits(q);
    if (digits.length >= 3) {
      const pattern = `%${likeEscape(digits)}%`;
      return or(
        ilike(customers.mobile, pattern),
        ilike(customers.altMobile, pattern),
      );
    }
  }

  const words = q.toLowerCase().split(/\s+/);
  const fullName = sql`lower(${customers.firstName} || ' ' || coalesce(${customers.lastName}, ''))`;
  const handle = normalizeInstagramHandle(q);
  return or(
    // Every word somewhere in the name: "ana sha" finds Ananya Sharma.
    and(
      ...words.map(
        (word) => sql`${fullName} LIKE ${`%${likeEscape(word)}%`} ESCAPE '\\'`,
      ),
    ),
    !handle // empty, or a post link: nothing to match
      ? undefined
      : ilike(customers.instagramHandle, `%${likeEscape(handle)}%`),
  );
}

/**
 * Customers matching `query` (all when empty), newest first, at most
 * CUSTOMER_LIST_LIMIT. `more` says whether there were others.
 */
export async function searchCustomers(
  query: string,
): Promise<{ customers: CustomerSummary[]; more: boolean }> {
  await requireUser();
  const rows = await db
    .select({
      id: customers.id,
      number: customers.number,
      firstName: customers.firstName,
      lastName: customers.lastName,
      mobile: customers.mobile,
      instagramHandle: customers.instagramHandle,
      city: customerAddresses.city,
    })
    .from(customers)
    .leftJoin(
      customerAddresses,
      and(
        eq(customerAddresses.customerId, customers.id),
        eq(customerAddresses.isDefault, true),
      ),
    )
    .where(customerSearchCondition(query))
    .orderBy(desc(customers.number))
    .limit(CUSTOMER_LIST_LIMIT + 1);
  return {
    customers: rows.slice(0, CUSTOMER_LIST_LIMIT).map((row) => ({
      id: row.id,
      code: formatCustomerId(row.number),
      name: customerName(row),
      mobile: row.mobile,
      instagramHandle: row.instagramHandle,
      city: row.city,
    })),
    more: rows.length > CUSTOMER_LIST_LIMIT,
  };
}

export type CustomerAddress = {
  id: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pin: string;
  isDefault: boolean;
};

const addressColumns = {
  id: customerAddresses.id,
  line1: customerAddresses.line1,
  line2: customerAddresses.line2,
  landmark: customerAddresses.landmark,
  city: customerAddresses.city,
  state: customerAddresses.state,
  pin: customerAddresses.pin,
  isDefault: customerAddresses.isDefault,
};

export type CustomerHeading = { id: string; code: string; name: string };

/** A customer's code and name (for page titles), or null if there's no such customer. */
export async function getCustomerHeading(
  id: string,
): Promise<CustomerHeading | null> {
  await requireUser();
  const [row] = await db
    .select({
      id: customers.id,
      number: customers.number,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
    .from(customers)
    .where(eq(customers.id, id));
  return row
    ? {
        id: row.id,
        code: formatCustomerId(row.number),
        name: customerName(row),
      }
    : null;
}

export type CustomerDetail = {
  id: string;
  code: string;
  name: string;
  firstName: string;
  lastName: string | null;
  mobile: string;
  altMobile: string | null;
  email: string | null;
  instagramHandle: string | null;
  source: CustomerSource | null;
  notes: string | null;
  createdAt: Date;
  addresses: CustomerAddress[];
};

/** One customer with their addresses (default first), or null if there's no such customer. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  await requireUser();
  // Independent reads: run them together (addresses of a missing customer are just []).
  const [customer, addresses] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, id) }),
    db
      .select(addressColumns)
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, id))
      .orderBy(
        desc(customerAddresses.isDefault),
        asc(customerAddresses.createdAt),
      ),
  ]);
  if (!customer) return null;
  return {
    id: customer.id,
    code: formatCustomerId(customer.number),
    name: customerName(customer),
    firstName: customer.firstName,
    lastName: customer.lastName,
    mobile: customer.mobile,
    altMobile: customer.altMobile,
    email: customer.email,
    instagramHandle: customer.instagramHandle,
    source: customer.source,
    notes: customer.notes,
    createdAt: customer.createdAt,
    addresses,
  };
}

export type AddressDetail = CustomerAddress & {
  customerId: string;
  customerName: string;
};

/** One address with whose it is, or null if there's no such address. */
export async function getAddress(id: string): Promise<AddressDetail | null> {
  await requireUser();
  const [row] = await db
    .select({
      ...addressColumns,
      customerId: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
    .from(customerAddresses)
    .innerJoin(customers, eq(customers.id, customerAddresses.customerId))
    .where(eq(customerAddresses.id, id));
  if (!row) return null;
  const { firstName, lastName, ...address } = row;
  return { ...address, customerName: customerName({ firstName, lastName }) };
}
