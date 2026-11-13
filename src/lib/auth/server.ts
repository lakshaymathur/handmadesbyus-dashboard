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
    // On in production by default; stored in Postgres so limits survive restarts.
    storage: "database",
    modelName: "rateLimits",
  },
  telemetry: { enabled: false },
  plugins: [
    username(),
    // Must be last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
