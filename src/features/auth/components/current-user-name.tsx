import { requireUser } from "@/lib/auth/session";

/** The signed-in user's name. Reads the session, so render it inside <Suspense>. */
export async function CurrentUserName() {
  const user = await requireUser();
  return (
    <span className="truncate text-sm text-muted-foreground">{user.name}</span>
  );
}
