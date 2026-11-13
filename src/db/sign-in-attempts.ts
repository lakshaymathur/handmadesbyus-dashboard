import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Executor } from "./connect";
import { rateLimits } from "./schema";

// Per-username sign-in limit, on top of Better Auth's per-IP limit. The per-IP limit is
// only as good as the client IP, which comes from a proxy header; this one caps guesses
// against one account however many addresses an attacker rotates through.
//
// Trade-off: anyone can lock a known username out for up to WINDOW_MS by failing
// MAX_ATTEMPTS times. Limits are loose enough that this needs sustained effort, and a
// lockout here never blocks other users.

export const SIGN_IN_LIMIT = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
};

// Rows share Better Auth's rate_limits table. Its keys are "<ip>|<path>"; an IP can't
// start with "username:", so the two never collide.
function keyFor(username: string): string {
  return `username:${username.trim().toLowerCase()}|/sign-in/username`;
}

/**
 * Records one sign-in attempt for `username` and returns how many attempts fall in the
 * current window, this one included. Atomic, so parallel requests can't slip past the
 * limit. The window starts at the first attempt after the previous one expired.
 */
export async function recordSignInAttempt(
  db: Executor,
  username: string,
  now = Date.now(),
): Promise<number> {
  const expired = sql`${rateLimits.lastRequest} <= ${now - SIGN_IN_LIMIT.windowMs}`;
  const [row] = await db
    .insert(rateLimits)
    .values({
      id: randomUUID(),
      key: keyFor(username),
      count: 1,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimits.lastRequest} END`,
      },
    })
    .returning({ count: rateLimits.count });
  return row?.count ?? 1;
}

/** Forgets attempts for `username` (after a successful sign-in or a password reset). */
export async function clearSignInAttempts(
  db: Executor,
  username: string,
): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, keyFor(username)));
}
