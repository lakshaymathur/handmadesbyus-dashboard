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
import { recordSignInAttempt, SIGN_IN_LIMIT } from "@/db/sign-in-attempts";
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

  it("refuses to create users whose username sign-in would reject", async () => {
    for (const username of ["Asha Rao", "asha@shop", "ab", "a".repeat(31)]) {
      await expect(
        createUserWithPassword(db, { username, name: "X", password: PASSWORD }),
      ).rejects.toThrow();
    }
    await expect(
      createUserWithPassword(db, {
        username: "ravi",
        name: "Ravi",
        password: "short",
      }),
    ).rejects.toThrow(/at least 10/);
  });

  it("signs in a user created with dots and underscores", async () => {
    await createUserWithPassword(db, {
      username: "Ravi_K.2",
      name: "Ravi",
      password: PASSWORD,
    });
    expect((await signIn("ravi_k.2", PASSWORD)).status).toBe(200);
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

  it("returns whole-form and nested field errors", async () => {
    await signIn("asha", PASSWORD);
    const orderSchema = z
      .object({
        items: z.array(z.object({ qty: z.number().min(1, "At least 1") })),
        discount: z.number(),
        subtotal: z.number(),
      })
      .refine(
        (o) => o.discount <= o.subtotal,
        "Discount can't exceed the subtotal",
      );
    const action = authedAction(orderSchema, async () => "saved");

    expect(
      await action({ items: [{ qty: 1 }], discount: 50, subtotal: 10 }),
    ).toEqual({
      ok: false,
      error: "Discount can't exceed the subtotal",
      fieldErrors: {},
    });
    expect(
      await action({
        items: [{ qty: 1 }, { qty: 0 }],
        discount: 0,
        subtotal: 10,
      }),
    ).toEqual({
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: { "items.1.qty": ["At least 1"] },
    });
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

describe("sign-in rate limiting", () => {
  // Through the HTTP handler, as a browser would hit it (auth.api calls skip rate limits).
  async function attempt(
    ip: string,
    password = "wrong-password-123",
  ): Promise<number> {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/username", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          username: "asha",
          password,
        }),
      }),
    );
    return response.status;
  }

  beforeEach(async () => {
    await createUserWithPassword(db, {
      username: "asha",
      name: "Asha",
      password: PASSWORD,
    });
  });

  it("blocks the 4th attempt within 10 seconds from the same IP, per IP", async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push(await attempt("203.0.113.5"));
    expect(statuses).toEqual([401, 401, 401, 429]);
    // Someone else, from another address, isn't locked out.
    expect(await attempt("198.51.100.7")).toBe(401);
  });

  it("trusts a single X-Forwarded-For value only as far as the per-username limit allows", async () => {
    // Rotating spoofed addresses dodges the per-IP limit, but not the per-account one.
    const statuses = [];
    for (let i = 1; i <= SIGN_IN_LIMIT.maxAttempts + 1; i++) {
      statuses.push(await attempt(`198.51.100.${i}`));
    }
    expect(statuses.slice(0, -1).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // While locked, even the right password is refused.
    expect(await attempt("192.0.2.200", PASSWORD)).toBe(429);
  });

  it("clears the per-username count after a successful sign-in", async () => {
    for (let i = 1; i < SIGN_IN_LIMIT.maxAttempts; i++) {
      expect(await attempt(`198.51.100.${i}`)).toBe(401);
    }
    expect((await signIn("asha", PASSWORD)).status).toBe(200);
    for (let i = 1; i < SIGN_IN_LIMIT.maxAttempts; i++) {
      expect(await attempt(`192.0.2.${i}`)).toBe(401);
    }
  });

  it("starts a new window once the old one has expired", async () => {
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 3; i++) await recordSignInAttempt(db, "ravi", t0);
    expect(await recordSignInAttempt(db, "RAVI", t0 + 1)).toBe(4);
    expect(
      await recordSignInAttempt(db, "ravi", t0 + SIGN_IN_LIMIT.windowMs),
    ).toBe(1);
  });

  // Origins are checked on requests that carry cookies (a signed-in browser); a first
  // sign-in is protected by the browser's fetch-metadata headers instead.
  async function postWithCookie(origin: string): Promise<number> {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: "better-auth.session_token=anything",
          "x-forwarded-for": "203.0.113.9",
        },
        body: "{}",
      }),
    );
    return response.status;
  }

  it("rejects cookie-carrying requests from an untrusted origin", async () => {
    expect(await postWithCookie("http://evil.example")).toBe(403);
  });

  it("accepts them from the app's own origin", async () => {
    expect(await postWithCookie("http://localhost:3000")).toBe(200);
  });
});
