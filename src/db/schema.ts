// Database schema: the source of truth for the data model (see CLAUDE.md).
// Columns are camelCase here and snake_case in Postgres (`casing: "snake_case"`).
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
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
