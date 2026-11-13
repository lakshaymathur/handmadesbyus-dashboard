import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { Database } from "./connect";
import { accounts, users } from "./schema";

export type NewUser = { username: string; name: string; password: string };

/**
 * Creates a user who signs in with username + password, in the format Better Auth expects
 * (public sign-up is disabled). Returns the existing user's id if the username is taken.
 */
export async function createUserWithPassword(
  db: Database,
  input: NewUser,
): Promise<{ id: string; created: boolean }> {
  const username = input.username.trim().toLowerCase();
  const existing = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.username, username),
  });
  if (existing) return { id: existing.id, created: false };

  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      name: input.name.trim(),
      username,
      displayUsername: input.username.trim(),
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
