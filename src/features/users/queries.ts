import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { byName } from "@/db/order";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

export type UserSummary = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  isYou: boolean;
};

const columns = {
  id: users.id,
  name: users.name,
  username: users.username,
  active: sql<boolean>`${users.deactivatedAt} IS NULL`,
};

/** Everyone who can sign in (or could, if reactivated): active first, then by name. */
export async function getUsers(): Promise<UserSummary[]> {
  const me = await requireUser();
  const rows = await db
    .select(columns)
    .from(users)
    .orderBy(sql`${users.deactivatedAt} IS NOT NULL`, byName(users.name));
  return rows.map((row) => ({ ...row, isYou: row.id === me.id }));
}

/** One user, or null if there's no such user. */
export async function getUser(id: string): Promise<UserSummary | null> {
  const me = await requireUser();
  const [row] = await db.select(columns).from(users).where(eq(users.id, id));
  return row ? { ...row, isYou: row.id === me.id } : null;
}
