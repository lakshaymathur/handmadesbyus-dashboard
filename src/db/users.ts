import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { newPasswordSchema, usernameSchema } from "@/features/auth/schema";
import type { Database } from "./connect";
import { accounts, users } from "./schema";

export type NewUser = { username: string; name: string; password: string };

/**
 * Creates a user who signs in with username + password, in the format Better Auth expects
 * (public sign-up is disabled). Returns the existing user's id if the username is taken.
 * Throws a ZodError for a username or password that sign-in would reject.
 */
export async function createUserWithPassword(
  db: Database,
  input: NewUser,
): Promise<{ id: string; created: boolean }> {
  // Same rules as sign-in, so we never create an account nobody can log in to.
  const displayUsername = usernameSchema.parse(input.username);
  const username = displayUsername.toLowerCase();
  const password = newPasswordSchema.parse(input.password);
  const existing = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.username, username),
  });
  if (existing) return { id: existing.id, created: false };

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      name: input.name.trim(),
      username,
      displayUsername,
      // Better Auth requires an email; `.invalid` is a reserved, never-routable domain.
      email: `${username}@users.invalid`,
    });
    await tx.insert(accounts).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
  });
  return { id, created: true };
}
