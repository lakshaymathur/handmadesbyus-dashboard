import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./server";

/** The signed-in user, narrowed to what the app needs. Safe to pass to the client. */
export type CurrentUser = { id: string; name: string; username: string };

/**
 * Reads and verifies the session (cookie + database). Returns null when signed out.
 * Cached per request, so calling it from several components costs one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, username, deactivatedAt } = session.user;
  // Typed optional by the username plugin, but NOT NULL in our users table.
  if (!username) return null;
  // Deactivating deletes the user's sessions too; this covers any request in flight.
  if (deactivatedAt) return null;
  return { id, name, username };
});

/**
 * The signed-in user, or a redirect to /login. Every query that returns data and every
 * server action (via authedAction) calls this: layouts and proxy.ts don't protect data.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
