// Signed-in requests for integration tests of server actions and queries. They read the
// session from next/headers; outside a real request, mock it with this module:
//
//   vi.mock("next/headers", async () => (await import("@/db/test/session")).nextHeadersMock);
//   …
//   const { userId } = await signInTestUser();
import { auth } from "@/lib/auth/server";
import { db } from "../client";
import { createUserWithPassword } from "../users";

const testRequest = { headers: new Headers() };

export const nextHeadersMock = {
  headers: async () => testRequest.headers,
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  }),
};

/** Creates a user and signs in as them: later server-action calls run as this user. */
export async function signInTestUser(
  username = "asha",
): Promise<{ userId: string }> {
  const password = "correct-horse-battery";
  const { id } = await createUserWithPassword(db, {
    username,
    name: username,
    password,
  });
  const response = await auth.api.signInUsername({
    body: { username, password },
    asResponse: true,
  });
  if (!response.ok) throw new Error(`Test sign-in failed: ${response.status}`);
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  testRequest.headers = new Headers({ cookie });
  return { userId: id };
}

/** Forgets the session: later calls run signed out. */
export function signOutTestUser(): void {
  testRequest.headers = new Headers();
}
