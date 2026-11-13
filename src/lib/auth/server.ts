import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

/**
 * Better Auth: username + password, sessions in Postgres. Server-only.
 * Users are created by the seed (and later by Settings), never by public sign-up.
 */
export const auth = betterAuth({
  appName: "HandMadesByUs",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Other addresses the app is opened at (e.g. a phone on the LAN); sign-in from any
  // other origin is rejected (CSRF protection).
  trustedOrigins: env.TRUSTED_ORIGINS,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  user: { modelName: "users" },
  session: {
    modelName: "sessions",
    expiresIn: 60 * 60 * 24 * 30, // 30 days: phones stay signed in
    updateAge: 60 * 60 * 24, // extend the expiry at most once a day
  },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
  },
  rateLimit: {
    // On everywhere (not just production) so it's tested. Per client IP; sign-in allows
    // 3 attempts per 10 seconds. Stored in Postgres so limits survive restarts.
    enabled: true,
    storage: "database",
    modelName: "rateLimits",
  },
  advanced: {
    // Better Auth skips origin (CSRF) checks under test by default; keep them on so tests
    // see what production does.
    disableOriginCheck: false,
    // Where the client IP comes from. Without one, Better Auth falls back to a single
    // shared bucket, so one person's failed attempts would lock everyone out.
    ipAddress: {
      ipAddressHeaders: env.CLIENT_IP_HEADERS,
      trustedProxies: env.TRUSTED_PROXIES,
    },
  },
  telemetry: { enabled: false },
  plugins: [
    username(),
    // Must be last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
