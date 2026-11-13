import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "next/headers",
  async () => (await import("@/db/test/session")).nextHeadersMock,
);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { signInTestUser } from "@/db/test/session";
import { createUserWithPassword } from "@/db/users";
import { ACCOUNT_DEACTIVATED } from "@/lib/auth/errors";
import { auth } from "@/lib/auth/server";
import {
  changeOwnPassword,
  createUser,
  renameUser,
  resetUserPassword,
  setUserActive,
} from "./actions";
import { getUsers } from "./queries";

const TEST_PASSWORD = "correct-horse-battery"; // signInTestUser's password

/** Signs in over HTTP, as the login form does. */
async function signInOverHttp(username: string, password: string) {
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/username", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ username, password }),
    }),
  );
  const body = (await response.json().catch(() => null)) as {
    code?: string;
  } | null;
  return { status: response.status, code: body?.code };
}

async function sessionCount(userId: string) {
  return db.$count(sessions, eq(sessions.userId, userId));
}

/** Another user who is signed in somewhere (one live session). */
async function otherSignedInUser() {
  const { id } = await createUserWithPassword(db, {
    username: "ravi",
    name: "Ravi",
    password: TEST_PASSWORD,
  });
  expect((await signInOverHttp("ravi", TEST_PASSWORD)).status).toBe(200);
  expect(await sessionCount(id)).toBe(1);
  return id;
}

let me: string;

beforeEach(async () => {
  ({ userId: me } = await signInTestUser("asha"));
});

describe("adding users", () => {
  it("creates a user who can sign in, then goes back to the list", async () => {
    await expect(
      createUser({
        name: " Meera  K ",
        username: "Meera.K",
        password: "a-new-temp-pass",
      }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("/settings/users"),
    });
    expect(
      (await getUsers()).map((u) => [u.name, u.username, u.isYou]),
    ).toEqual([
      ["asha", "asha", true],
      ["Meera K", "meera.k", false],
    ]);
    expect((await signInOverHttp("meera.k", "a-new-temp-pass")).status).toBe(
      200,
    );
  });

  it("rejects a taken username (any case) and weak input", async () => {
    expect(
      await createUser({
        name: "A",
        username: "ASHA",
        password: "a-new-temp-pass",
      }),
    ).toEqual({
      ok: false,
      error: "That username is taken.",
      fieldErrors: { username: ["Already taken"] },
    });
    expect(
      await createUser({ name: "", username: "a b", password: "short" }),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        name: expect.any(Array),
        username: expect.any(Array),
        password: expect.any(Array),
      },
    });
  });
});

describe("renaming", () => {
  it("changes the display name only", async () => {
    await renameUser({ id: me, name: "Asha  Rao" });
    const [row] = await db.select().from(users).where(eq(users.id, me));
    expect(row).toMatchObject({ name: "Asha Rao", username: "asha" });
  });
});

describe("resetting someone's password", () => {
  it("sets the new password and signs them out everywhere", async () => {
    const ravi = await otherSignedInUser();
    expect(
      await resetUserPassword({ id: ravi, password: "brand-new-password" }),
    ).toEqual({ ok: true, data: undefined });
    expect(await sessionCount(ravi)).toBe(0);
    expect((await signInOverHttp("ravi", TEST_PASSWORD)).status).toBe(401);
    expect((await signInOverHttp("ravi", "brand-new-password")).status).toBe(
      200,
    );
  });

  it("lifts a sign-in lockout", async () => {
    const ravi = await otherSignedInUser();
    for (let i = 0; i < 11; i++)
      await signInOverHttp("ravi", `wrong-guess-${i}`);
    expect((await signInOverHttp("ravi", TEST_PASSWORD)).status).toBe(429);
    await resetUserPassword({ id: ravi, password: "brand-new-password" });
    expect((await signInOverHttp("ravi", "brand-new-password")).status).toBe(
      200,
    );
  });

  it("refuses your own: that needs the current password", async () => {
    expect(
      await resetUserPassword({ id: me, password: "brand-new-password" }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Change password/),
    });
  });
});

describe("deactivating", () => {
  it("signs them out and blocks sign-in until reactivated", async () => {
    const ravi = await otherSignedInUser();
    expect(await setUserActive({ id: ravi, active: false })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await sessionCount(ravi)).toBe(0);
    // The right password now gets a clear "deactivated", not a wrong-password message.
    expect(await signInOverHttp("ravi", TEST_PASSWORD)).toEqual({
      status: 403,
      code: ACCOUNT_DEACTIVATED,
    });
    // A wrong password still just says wrong password (nothing revealed).
    expect((await signInOverHttp("ravi", "wrong-password-123")).status).toBe(
      401,
    );
    expect((await getUsers()).find((u) => u.id === ravi)?.active).toBe(false);

    await setUserActive({ id: ravi, active: true });
    expect((await signInOverHttp("ravi", TEST_PASSWORD)).status).toBe(200);
  });

  it("won't let you deactivate yourself", async () => {
    expect(await setUserActive({ id: me, active: false })).toEqual({
      ok: false,
      error: "You can't deactivate yourself.",
    });
  });

  it("treats a deactivated user's surviving session as signed out", async () => {
    // Belt and braces: even if a session row survived, it no longer works.
    await db
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, me));
    await expect(renameUser({ id: me, name: "X" })).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });
});

describe("changing your own password", () => {
  it("needs the right current password", async () => {
    expect(
      await changeOwnPassword({
        currentPassword: "not-my-password",
        newPassword: "brand-new-password",
      }),
    ).toEqual({
      ok: false,
      error: "Your current password isn't right.",
      fieldErrors: { currentPassword: ["Wrong password"] },
    });
    expect((await signInOverHttp("asha", TEST_PASSWORD)).status).toBe(200);
  });

  it("changes it and signs out your other sessions", async () => {
    expect((await signInOverHttp("asha", TEST_PASSWORD)).status).toBe(200);
    expect(await sessionCount(me)).toBe(2);
    expect(
      await changeOwnPassword({
        currentPassword: TEST_PASSWORD,
        newPassword: "brand-new-password",
      }),
    ).toEqual({ ok: true, data: undefined });
    // Better Auth replaces this session and revokes the rest.
    expect(await sessionCount(me)).toBe(1);
    expect((await signInOverHttp("asha", TEST_PASSWORD)).status).toBe(401);
    expect((await signInOverHttp("asha", "brand-new-password")).status).toBe(
      200,
    );
  });

  it("rejects reusing the current password", async () => {
    expect(
      await changeOwnPassword({
        currentPassword: TEST_PASSWORD,
        newPassword: TEST_PASSWORD,
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { newPassword: expect.any(Array) },
    });
  });

  it("limits guesses at the current password", async () => {
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(
        await changeOwnPassword({
          currentPassword: `guess-number-${i}`,
          newPassword: "brand-new-password",
        }),
      );
    }
    expect(results.at(-1)).toEqual({
      ok: false,
      error: "Too many attempts. Try again in 15 minutes.",
    });
  });
});
