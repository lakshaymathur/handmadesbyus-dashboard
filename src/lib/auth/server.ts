import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import {
  clearSignInAttempts,
  recordSignInAttempt,
  SIGN_IN_LIMIT,
} from "@/db/sign-in-attempts";
import { getServerEnv } from "@/lib/env";
import { ACCOUNT_DEACTIVATED } from "./errors";

const env = getServerEnv();

const SIGN_IN_PATH = "/sign-in/username";

function signInUsername(body: unknown): string | null {
  const value = (body as { username?: unknown } | undefined)?.username;
  return typeof value === "string" && value.trim() ? value : null;
}

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
  user: {
    modelName: "users",
    additionalFields: {
      // Read-only through the auth API (input: false); set by Settings → Users.
      deactivatedAt: { type: "date", required: false, input: false },
    },
  },
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
  databaseHooks: {
    session: {
      create: {
        // The one place every sign-in path goes through: deactivated users get no
        // session. Runs after the password check, so it only tells someone who knows
        // the password that the account is deactivated.
        before: async (session) => {
          const user = await db.query.users.findFirst({
            columns: { deactivatedAt: true },
            where: eq(schema.users.id, session.userId),
          });
          if (!user || user.deactivatedAt) {
            throw new APIError("FORBIDDEN", {
              message: "This account has been deactivated.",
              code: ACCOUNT_DEACTIVATED,
            });
          }
        },
      },
    },
  },
  hooks: {
    // Per-username limit (src/db/sign-in-attempts.ts). Counted before the password check
    // so parallel guesses can't race past it; a successful sign-in clears the count.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const name = signInUsername(ctx.body);
      if (!name) return;
      if ((await recordSignInAttempt(db, name)) > SIGN_IN_LIMIT.maxAttempts) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message:
            "Too many sign-in attempts for this account. Try again later.",
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH || !ctx.context.newSession) return;
      const name = signInUsername(ctx.body);
      if (name) await clearSignInAttempts(db, name);
    }),
  },
  telemetry: { enabled: false },
  plugins: [
    username(),
    // Must be last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
