"use server";

import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { uniqueViolation } from "@/db/errors";
import { accounts, sessions, users } from "@/db/schema";
import {
  clearSignInAttempts,
  recordSignInAttempt,
  SIGN_IN_LIMIT,
} from "@/db/sign-in-attempts";
import { createUserWithPassword } from "@/db/users";
import { ActionError, authedAction } from "@/lib/auth/action";
import { auth } from "@/lib/auth/server";
import {
  changeOwnPasswordSchema,
  createUserSchema,
  renameUserSchema,
  resetPasswordSchema,
  setUserActiveSchema,
} from "./schema";

// User management (§4). Everyone has full access, so any signed-in user may manage
// users; the guards below stop accidental lockouts and silent account takeover.

const GONE = "That user no longer exists. Reload the page.";

const TAKEN = new ActionError("That username is taken.", {
  username: ["Already taken"],
});

export const createUser = authedAction(
  createUserSchema,
  async ({ name, username, password }) => {
    let created: boolean;
    try {
      ({ created } = await createUserWithPassword(db, {
        name,
        username,
        password,
      }));
    } catch (error) {
      // Two people adding the same username at once.
      if (uniqueViolation(error) !== null) throw TAKEN;
      throw error;
    }
    if (!created) throw TAKEN;
    redirect("/settings/users");
  },
);

export const renameUser = authedAction(
  renameUserSchema,
  async ({ id, name }) => {
    const rows = await db
      .update(users)
      .set({ name })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (rows.length === 0) throw new ActionError(GONE);
    refresh();
  },
);

/**
 * Sets a new password for someone else and signs them out everywhere. Your own password
 * changes through changeOwnPassword, which needs the current one: a stolen session
 * shouldn't be enough to lock the real owner out.
 */
export const resetUserPassword = authedAction(
  resetPasswordSchema,
  async ({ id, password }, { user }) => {
    if (id === user.id) {
      throw new ActionError(
        "To change your own password, use “Change password”.",
      );
    }
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(accounts)
        .set({ password: hash })
        .where(
          and(eq(accounts.userId, id), eq(accounts.providerId, "credential")),
        )
        .returning({ id: accounts.id });
      if (rows.length === 0) throw new ActionError(GONE);
      await tx.delete(sessions).where(eq(sessions.userId, id));
    });
    refresh();
  },
);

/**
 * Deactivates (no sign-in, all sessions ended) or reactivates a user. You can't
 * deactivate yourself, or the last active user: someone must always be able to sign in.
 */
export const setUserActive = authedAction(
  setUserActiveSchema,
  async ({ id, active }, { user }) => {
    if (!active && id === user.id) {
      throw new ActionError("You can't deactivate yourself.");
    }
    await db.transaction(async (tx) => {
      // Lock the active users so two people can't deactivate the last two at once.
      const activeUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(isNull(users.deactivatedAt))
        .for("update");
      if (!active && !activeUsers.some((u) => u.id !== id)) {
        throw new ActionError("At least one user must stay active.");
      }
      const rows = await tx
        .update(users)
        .set({ deactivatedAt: active ? null : new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id });
      if (rows.length === 0) throw new ActionError(GONE);
      if (!active) await tx.delete(sessions).where(eq(sessions.userId, id));
    });
    refresh();
  },
);

/**
 * Changes the signed-in user's password after checking the current one, and signs out
 * their other sessions. Wrong current passwords count towards the same per-username
 * limit as sign-in (auth.api calls skip Better Auth's own per-IP limit).
 */
export const changeOwnPassword = authedAction(
  changeOwnPasswordSchema,
  async ({ currentPassword, newPassword }, { user }) => {
    if (
      (await recordSignInAttempt(db, user.username)) > SIGN_IN_LIMIT.maxAttempts
    ) {
      throw new ActionError("Too many attempts. Try again in 15 minutes.");
    }
    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: await headers(),
      });
    } catch (error) {
      if (isInvalidPassword(error)) {
        throw new ActionError("Your current password isn't right.", {
          currentPassword: ["Wrong password"],
        });
      }
      throw error;
    }
    await clearSignInAttempts(db, user.username);
  },
);

function isInvalidPassword(error: unknown): boolean {
  const body = (error as { body?: { code?: unknown } } | null)?.body;
  return body?.code === "INVALID_PASSWORD";
}
