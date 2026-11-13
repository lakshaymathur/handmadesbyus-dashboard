import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Server actions read the session from next/headers. Outside a real request, feed it the
// cookie from a real Better Auth sign-in instead.
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

import { db } from "@/db/client";
import { createUserWithPassword } from "@/db/users";
import { ActionError, authedAction } from "./action";
import { auth } from "./server";

const PASSWORD = "correct-horse-battery";

async function signIn(username: string, password: string): Promise<Response> {
  const response = await auth.api.signInUsername({
    body: { username, password },
    asResponse: true,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  request.headers = new Headers({ cookie });
  return response;
}

const schema = z.object({ name: z.string().trim().min(2) });

describe("Better Auth setup", () => {
  beforeEach(async () => {
    request.headers = new Headers();
    await createUserWithPassword(db, {
      username: "Asha",
      name: "Asha",
      password: PASSWORD,
    });
  });

  it("signs in a seeded user by username, case-insensitively", async () => {
    expect((await signIn("ASHA", PASSWORD)).status).toBe(200);
  });

  it("rejects a wrong password", async () => {
    expect((await signIn("asha", "wrong-password-123")).status).toBe(401);
  });

  it("has public sign-up disabled", async () => {
    const response = await auth.api.signUpEmail({
      body: {
        email: "new@example.com",
        password: "some-long-password",
        name: "New",
      },
      asResponse: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const count = await db.$count((await import("@/db/schema")).users);
    expect(count).toBe(1);
  });
});

describe("authedAction()", () => {
  let userId: string;

  beforeEach(async () => {
    request.headers = new Headers();
    ({ id: userId } = await createUserWithPassword(db, {
      username: "asha",
      name: "Asha",
      password: PASSWORD,
    }));
  });

  it("redirects to /login when signed out, without running the handler", async () => {
    const handler = vi.fn();
    const action = authedAction(schema, handler);
    await expect(action({ name: "Ravi" })).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("treats a forged session cookie as signed out", async () => {
    request.headers = new Headers({
      cookie: "better-auth.session_token=forged.value",
    });
    const action = authedAction(schema, async () => "ran");
    await expect(action({ name: "Ravi" })).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });

  it("returns field errors for invalid input, without running the handler", async () => {
    await signIn("asha", PASSWORD);
    const handler = vi.fn();
    const result = await authedAction(schema, handler)({ name: " x " });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(Array) },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes parsed input, the user and audit fields to the handler", async () => {
    await signIn("asha", PASSWORD);
    const result = await authedAction(schema, async (input, ctx) => ({
      input,
      ctx,
    }))({
      name: "  Ravi  ",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        input: { name: "Ravi" },
        ctx: {
          user: { id: userId, name: "Asha", username: "asha" },
          audit: {
            create: { createdBy: userId, updatedBy: userId },
            update: { updatedBy: userId },
          },
        },
      },
    });
  });

  it("shows ActionError messages to the user", async () => {
    await signIn("asha", PASSWORD);
    const result = await authedAction(schema, async () => {
      throw new ActionError("Mobile number already exists", {
        mobile: ["Taken"],
      });
    })({ name: "Ravi" });
    expect(result).toEqual({
      ok: false,
      error: "Mobile number already exists",
      fieldErrors: { mobile: ["Taken"] },
    });
  });

  it("hides unexpected errors behind a generic message", async () => {
    await signIn("asha", PASSWORD);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await authedAction(schema, async () => {
      throw new Error('relation "secret_table" does not exist');
    })({ name: "Ravi" });
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
