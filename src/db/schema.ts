// Database schema: the source of truth for the data model (see CLAUDE.md).
// Columns are camelCase here and snake_case in Postgres (`casing: "snake_case"`).
import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// ---------------------------------------------------------------------------
// Auth (Better Auth, src/lib/auth/server.ts). Field names must match what Better Auth
// expects, so these tables don't follow the app's created_by/updated_by audit rule.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  // Better Auth requires an email; we sign in by username and store a placeholder.
  email: text().notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  // Lower-cased by Better Auth. Required: every user signs in with one.
  username: text().notNull().unique(),
  displayUsername: text(),
  // Set when the user is deactivated (Settings → Users): no new sessions, and existing
  // ones are deleted and treated as signed out (src/lib/auth). Null = active.
  deactivatedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    // Password hash (scrypt) for username + password sign-in.
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);

// Sign-in attempt counters (Better Auth rate limiting, `storage: "database"`).
export const rateLimits = pgTable("rate_limits", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// App tables. Conventions:
// - uuid primary keys; readable IDs (C-0001, HMU-YYMM-####) are separate columns.
// - Money is integer paise; calendar dates are `date` ("YYYY-MM-DD"); moments timestamptz.
// - Sizes are whole millimetres and grams (shown as cm / g), so no floating point.
// - Every table has created/updated at/by (audit()). Exception: id_counters (internal).
// - Rows that orders refer to are never hard-deleted: FKs default to RESTRICT, and
//   products/options/list items are archived or deactivated instead.
// ---------------------------------------------------------------------------

function audit() {
  return {
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    createdBy: text()
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    updatedBy: text()
      .notNull()
      .references(() => users.id),
  };
}

/** CHECK that a money/size column is ≥ 0 (or > 0 with `positive`); NULL passes. */
function nonNegative(name: string, column: AnyPgColumn, positive = false) {
  return check(name, positive ? sql`${column} > 0` : sql`${column} >= 0`);
}

/** CHECK that a name is trimmed and not empty, so "Red" and "Red " can't both exist. */
function trimmedName(name: string, column: AnyPgColumn) {
  return check(name, sql`${column} = btrim(${column}) AND ${column} <> ''`);
}

const lower = (column: AnyPgColumn): SQL => sql`lower(${column})`;

// --- Enums (fixed by the spec; managed lists live in tables below) ----------

export const customerSource = pgEnum("customer_source", [
  "instagram",
  "whatsapp",
  "referral",
  "exhibition",
  "website",
  "other",
]);

export const orderChannel = pgEnum("order_channel", [
  "instagram",
  "whatsapp",
  "phone",
  "in_person",
  "website",
  "other",
]);

export const orderPriority = pgEnum("order_priority", ["normal", "urgent"]);

/**
 * Order status (§2.6). Production progress lives on each item (production_stage_id);
 * the order is `in_production` until every item reaches its category's last stage.
 */
export const orderStatus = pgEnum("order_status", [
  "in_production",
  "ready_for_pickup",
  "docket_raised",
  "in_transit",
  "delivered",
  "on_hold",
  "cancelled",
  "returned",
]);

export const discountType = pgEnum("discount_type", ["flat", "percent"]);

export const customisationInput = pgEnum("customisation_input", [
  "none",
  "text",
  "choice",
]);

export const shipmentBooking = pgEnum("shipment_booking", [
  "direct",
  "aggregator",
]);

export const shipmentStatus = pgEnum("shipment_status", [
  "docket_raised",
  "in_transit",
  "delivered",
  "returned",
]);

export const paymentMode = pgEnum("payment_mode", [
  "upi",
  "cash",
  "bank_transfer",
  "card",
  "other",
]);

export const paymentType = pgEnum("payment_type", [
  "advance",
  "balance",
  "refund",
]);

export const expenseCategory = pgEnum("expense_category", [
  "raw_materials",
  "packaging",
  "courier",
  "marketing",
  "tools",
  "other",
]);

/** Simple managed lists that are just a name (§2.2, §3.7). */
export const listKind = pgEnum("list_kind", [
  "product_type",
  "colour",
  "design",
  "aggregator",
]);

// --- Settings and managed lists (§3.7) --------------------------------------

/** One row (id = 1). Thresholds and other app-wide settings. */
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer().primaryKey().default(1),
    dueSoonDays: integer().notNull().default(3),
    ...audit(),
  },
  (t) => [
    check("app_settings_single_row", sql`${t.id} = 1`),
    check("app_settings_due_soon_days", sql`${t.dueSoonDays} BETWEEN 0 AND 60`),
  ],
);

/**
 * Next number per readable-ID series: "customer", or "order:2611" (one per IST month).
 * Allocated atomically with UPDATE … RETURNING. Internal, so no audit columns.
 */
export const idCounters = pgTable(
  "id_counters",
  {
    name: text().primaryKey(),
    lastValue: integer().notNull().default(0),
  },
  (t) => [nonNegative("id_counters_last_value", t.lastValue)],
);

/** Product types, colours, designs and aggregators. Deactivate instead of deleting. */
export const listItems = pgTable(
  "list_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: listKind().notNull(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...audit(),
  },
  (t) => [
    trimmedName("list_items_name", t.name),
    uniqueIndex("list_items_kind_name_unique").on(t.kind, lower(t.name)),
  ],
);

export const deliveryPartners = pgTable(
  "delivery_partners",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    // e.g. https://www.delhivery.com/track/package/{awb}
    trackingUrlTemplate: text(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...audit(),
  },
  (t) => [
    trimmedName("delivery_partners_name", t.name),
    uniqueIndex("delivery_partners_name_unique").on(lower(t.name)),
    check(
      "delivery_partners_tracking_url",
      sql`${t.trackingUrlTemplate} ~ '^https?://' AND position('{awb}' in ${t.trackingUrlTemplate}) > 0`,
    ),
  ],
);

/** Product categories (Box, Pouch, …). Each has its own production stages. */
export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...audit(),
  },
  (t) => [
    trimmedName("categories_name", t.name),
    uniqueIndex("categories_name_unique").on(lower(t.name)),
  ],
);

/**
 * A category's production stages, in `position` order (§2.6). Order items point at a
 * stage, so a stage in use can't be deleted (RESTRICT). Positions aren't unique, so
 * reordering can swap them without a deferred constraint; the app keeps them distinct.
 */
export const productionStages = pgTable(
  "production_stages",
  {
    id: uuid().primaryKey().defaultRandom(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    name: text().notNull(),
    position: integer().notNull(),
    ...audit(),
  },
  (t) => [
    trimmedName("production_stages_name", t.name),
    nonNegative("production_stages_position", t.position),
    uniqueIndex("production_stages_category_name_unique").on(
      t.categoryId,
      lower(t.name),
    ),
    // Target of order_items' (category_id, production_stage_id) foreign key.
    unique("production_stages_category_id_unique").on(t.categoryId, t.id),
  ],
);

/** Customisation options (§2.3): Latkan, Sticker, … each with an extra price and cost. */
export const customisationOptions = pgTable(
  "customisation_options",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    inputType: customisationInput().notNull(),
    // Only for text input.
    maxLength: integer(),
    extraPrice: integer().notNull().default(0),
    extraCost: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    // Retired options stay on old orders but can't be picked for new ones.
    active: boolean().notNull().default(true),
    ...audit(),
  },
  (t) => [
    trimmedName("customisation_options_name", t.name),
    uniqueIndex("customisation_options_name_unique").on(lower(t.name)),
    nonNegative("customisation_options_extra_price", t.extraPrice),
    nonNegative("customisation_options_extra_cost", t.extraCost),
    check(
      "customisation_options_max_length",
      sql`(${t.inputType} = 'text') = (${t.maxLength} IS NOT NULL) AND (${t.maxLength} IS NULL OR ${t.maxLength} BETWEEN 1 AND 500)`,
    ),
  ],
);

/** Choices for options with input type "choice" (e.g. Latkan colours). */
export const customisationChoices = pgTable(
  "customisation_choices",
  {
    id: uuid().primaryKey().defaultRandom(),
    optionId: uuid()
      .notNull()
      .references(() => customisationOptions.id),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...audit(),
  },
  (t) => [
    trimmedName("customisation_choices_name", t.name),
    uniqueIndex("customisation_choices_option_name_unique").on(
      t.optionId,
      lower(t.name),
    ),
  ],
);

/** Which categories an option applies to. */
export const customisationOptionCategories = pgTable(
  "customisation_option_categories",
  {
    optionId: uuid()
      .notNull()
      .references(() => customisationOptions.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    ...audit(),
  },
  (t) => [primaryKey({ columns: [t.optionId, t.categoryId] })],
);

// --- Customers (§2.1) ----------------------------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Shown as C-0001 (lib/ids); from id_counters "customer".
    number: integer().notNull().unique(),
    firstName: text().notNull(),
    lastName: text(),
    mobile: text().notNull().unique(),
    altMobile: text(),
    email: text(),
    // Stored lower-case without "@" (Instagram handles are case-insensitive).
    instagramHandle: text(),
    source: customerSource(),
    notes: text(),
    ...audit(),
  },
  (t) => [
    unique("customers_instagram_handle_unique").on(t.instagramHandle),
    nonNegative("customers_number", t.number, true),
    trimmedName("customers_first_name", t.firstName),
    check("customers_mobile", sql`${t.mobile} ~ '^[0-9]{10}$'`),
    check("customers_alt_mobile", sql`${t.altMobile} ~ '^[0-9]{10}$'`),
    check(
      "customers_email",
      sql`${t.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`,
    ),
    check(
      "customers_instagram_handle",
      sql`${t.instagramHandle} ~ '^[a-z0-9._]{1,30}$'`,
    ),
    index("customers_first_name_idx").on(lower(t.firstName)),
  ],
);

/** Address columns shared by customer addresses and the order's delivery snapshot. */
function addressColumns() {
  return {
    line1: text().notNull(), // house / flat no.
    line2: text(), // street / area
    landmark: text(),
    city: text().notNull(),
    state: text().notNull(),
    pin: text().notNull(),
    country: text().notNull().default("India"),
  };
}

const pinCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} ~ '^[1-9][0-9]{5}$'`);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    ...addressColumns(),
    isDefault: boolean().notNull().default(false),
    ...audit(),
  },
  (t) => [
    pinCheck("customer_addresses_pin", t.pin),
    index("customer_addresses_customer_idx").on(t.customerId),
    // At most one default address per customer.
    uniqueIndex("customer_addresses_one_default")
      .on(t.customerId)
      .where(sql`${t.isDefault}`),
  ],
);

// --- Products (§2.2) -------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    // User-defined, e.g. BOX-SQ-RED-01. Unique ignoring case.
    sku: text().notNull(),
    name: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    // list_items of kind product_type / colour / design (the app checks the kind).
    typeId: uuid().references(() => listItems.id),
    colourId: uuid().references(() => listItems.id),
    designId: uuid().references(() => listItems.id),
    lengthMm: integer(),
    widthMm: integer(),
    heightMm: integer(),
    weightG: integer(),
    price: integer().notNull(),
    cost: integer().notNull(),
    // Archive instead of delete once the product is on an order.
    archivedAt: timestamp({ withTimezone: true }),
    ...audit(),
  },
  (t) => [
    trimmedName("products_sku", t.sku),
    trimmedName("products_name", t.name),
    uniqueIndex("products_sku_unique").on(lower(t.sku)),
    nonNegative("products_price", t.price),
    nonNegative("products_cost", t.cost),
    nonNegative("products_length", t.lengthMm, true),
    nonNegative("products_width", t.widthMm, true),
    nonNegative("products_height", t.heightMm, true),
    nonNegative("products_weight", t.weightG, true),
    index("products_category_idx").on(t.categoryId),
  ],
);

/** 1–5 photos per product (the app enforces the limit); position 0 is the thumbnail. */
export const productPhotos = pgTable(
  "product_photos",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    storageKey: text().notNull(),
    position: integer().notNull(),
    ...audit(),
  },
  (t) => [
    unique("product_photos_storage_key_unique").on(t.storageKey),
    nonNegative("product_photos_position", t.position),
    index("product_photos_product_idx").on(t.productId),
  ],
);

/** Customisation options a product supports. */
export const productCustomisationOptions = pgTable(
  "product_customisation_options",
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    optionId: uuid()
      .notNull()
      .references(() => customisationOptions.id),
    ...audit(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.optionId] })],
);

// --- Orders (§2.4–2.6) -----------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    // HMU-YYMM-#### (lib/ids), from id_counters "order:YYMM".
    code: text().notNull().unique(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    orderDate: date({ mode: "string" }).notNull(),
    promisedDate: date({ mode: "string" }).notNull(),
    priority: orderPriority().notNull().default("normal"),
    channel: orderChannel(),
    status: orderStatus().notNull().default("in_production"),
    // Discount: none (type NULL), flat paise, or a percentage in basis points (1250 = 12.5%).
    discountType: discountType(),
    discountFlat: integer().notNull().default(0),
    discountPercentBp: integer().notNull().default(0),
    shippingCharged: integer().notNull().default(0),
    // Delivery address snapshot: copied from the customer's address, editable per order,
    // and unaffected by later changes to the customer's addresses.
    deliveryLine1: text().notNull(),
    deliveryLine2: text(),
    deliveryLandmark: text(),
    deliveryCity: text().notNull(),
    deliveryState: text().notNull(),
    deliveryPin: text().notNull(),
    deliveryCountry: text().notNull().default("India"),
    // Revenue is recognised on this date (§3.6). Required once delivered.
    deliveredDate: date({ mode: "string" }),
    cancelReason: text(),
    refundOwed: boolean().notNull().default(false),
    notes: text(),
    ...audit(),
  },
  (t) => [
    check("orders_code", sql`${t.code} ~ '^HMU-[0-9]{4}-[0-9]{4,}$'`),
    check(
      "orders_promised_after_order",
      sql`${t.promisedDate} >= ${t.orderDate}`,
    ),
    nonNegative("orders_discount_flat", t.discountFlat),
    check(
      "orders_discount_percent",
      sql`${t.discountPercentBp} BETWEEN 0 AND 10000`,
    ),
    check(
      "orders_discount_type",
      sql`CASE ${t.discountType}
            WHEN 'flat' THEN ${t.discountPercentBp} = 0
            WHEN 'percent' THEN ${t.discountFlat} = 0
            ELSE ${t.discountFlat} = 0 AND ${t.discountPercentBp} = 0
          END`,
    ),
    nonNegative("orders_shipping_charged", t.shippingCharged),
    pinCheck("orders_delivery_pin", t.deliveryPin),
    check(
      "orders_delivered_date",
      sql`${t.status} <> 'delivered' OR ${t.deliveredDate} IS NOT NULL`,
    ),
    check(
      "orders_cancel_reason",
      sql`${t.status} <> 'cancelled' OR btrim(coalesce(${t.cancelReason}, '')) <> ''`,
    ),
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_promised_idx").on(t.status, t.promisedDate),
    index("orders_delivered_date_idx").on(t.deliveredDate),
  ],
);

/**
 * One row per product in an order (§2.5). Prices and costs are snapshots from order
 * time. `categoryId` is copied from the product too, and the composite foreign key keeps
 * the production stage within that category's stages.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    categoryId: uuid().notNull(),
    productionStageId: uuid().notNull(),
    position: integer().notNull().default(0),
    quantity: integer().notNull().default(1),
    unitPrice: integer().notNull(),
    unitCost: integer().notNull(),
    notes: text(),
    ...audit(),
  },
  (t) => [
    foreignKey({
      name: "order_items_stage_in_category_fk",
      columns: [t.categoryId, t.productionStageId],
      foreignColumns: [productionStages.categoryId, productionStages.id],
    }),
    nonNegative("order_items_quantity", t.quantity, true),
    nonNegative("order_items_unit_price", t.unitPrice),
    nonNegative("order_items_unit_cost", t.unitCost),
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
  ],
);

/** Customisations chosen for an item, with their price and cost snapshotted (§2.3). */
export const orderItemCustomisations = pgTable(
  "order_item_customisations",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    optionId: uuid()
      .notNull()
      .references(() => customisationOptions.id),
    choiceId: uuid().references(() => customisationChoices.id),
    textValue: text(),
    // Per unit; the line total multiplies by the item's quantity.
    price: integer().notNull(),
    cost: integer().notNull(),
    ...audit(),
  },
  (t) => [
    nonNegative("order_item_customisations_price", t.price),
    nonNegative("order_item_customisations_cost", t.cost),
    unique("order_item_customisations_option_unique").on(
      t.orderItemId,
      t.optionId,
    ),
  ],
);

/**
 * Every order status change and item stage change (§2.6), written by the one function
 * that changes them. Order rows have from/to status; item rows have from/to stage.
 */
export const statusHistory = pgTable(
  "status_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    orderItemId: uuid().references(() => orderItems.id, {
      onDelete: "set null",
    }),
    fromStatus: orderStatus(),
    toStatus: orderStatus(),
    fromStageId: uuid().references(() => productionStages.id),
    toStageId: uuid().references(() => productionStages.id),
    note: text(),
    ...audit(),
  },
  (t) => [
    check(
      "status_history_kind",
      sql`(${t.toStatus} IS NOT NULL AND ${t.toStageId} IS NULL AND ${t.fromStageId} IS NULL)
          OR (${t.toStageId} IS NOT NULL AND ${t.toStatus} IS NULL AND ${t.fromStatus} IS NULL)`,
    ),
    index("status_history_order_idx").on(t.orderId, t.createdAt),
  ],
);

// --- Shipments and payments (§2.7, §2.8) -----------------------------------------

export const shipments = pgTable(
  "shipments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    bookedVia: shipmentBooking().notNull(),
    // list_items of kind aggregator; only when booked via an aggregator.
    aggregatorId: uuid().references(() => listItems.id),
    deliveryPartnerId: uuid()
      .notNull()
      .references(() => deliveryPartners.id),
    awb: text(),
    shippingCost: integer().notNull().default(0),
    weightG: integer(),
    lengthMm: integer(),
    widthMm: integer(),
    heightMm: integer(),
    dispatchDate: date({ mode: "string" }),
    deliveredDate: date({ mode: "string" }),
    status: shipmentStatus().notNull().default("docket_raised"),
    ...audit(),
  },
  (t) => [
    unique("shipments_partner_awb_unique").on(t.deliveryPartnerId, t.awb),
    check(
      "shipments_aggregator",
      sql`(${t.bookedVia} = 'aggregator') = (${t.aggregatorId} IS NOT NULL)`,
    ),
    check("shipments_awb", sql`${t.awb} = btrim(${t.awb}) AND ${t.awb} <> ''`),
    check(
      "shipments_awb_required",
      sql`${t.status} = 'docket_raised' OR ${t.awb} IS NOT NULL`,
    ),
    nonNegative("shipments_shipping_cost", t.shippingCost),
    nonNegative("shipments_weight", t.weightG, true),
    nonNegative("shipments_length", t.lengthMm, true),
    nonNegative("shipments_width", t.widthMm, true),
    nonNegative("shipments_height", t.heightMm, true),
    index("shipments_order_idx").on(t.orderId),
    index("shipments_awb_idx").on(t.awb),
  ],
);

/** Payments against an order. Refunds are negative; everything else positive. */
export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    amount: integer().notNull(),
    paidOn: date({ mode: "string" }).notNull(),
    mode: paymentMode().notNull(),
    type: paymentType().notNull(),
    reference: text(),
    ...audit(),
  },
  (t) => [
    check(
      "payments_amount_sign",
      sql`CASE WHEN ${t.type} = 'refund' THEN ${t.amount} < 0 ELSE ${t.amount} > 0 END`,
    ),
    index("payments_order_idx").on(t.orderId),
  ],
);

// --- Expenses (§2.9) ---------------------------------------------------------------

export const expenses = pgTable(
  "expenses",
  {
    id: uuid().primaryKey().defaultRandom(),
    spentOn: date({ mode: "string" }).notNull(),
    amount: integer().notNull(),
    description: text().notNull(),
    category: expenseCategory().notNull(),
    paidVia: paymentMode().notNull(),
    // Receipt image in storage [P2].
    receiptKey: text(),
    ...audit(),
  },
  (t) => [
    nonNegative("expenses_amount", t.amount, true),
    trimmedName("expenses_description", t.description),
    index("expenses_spent_on_idx").on(t.spentOn),
  ],
);
