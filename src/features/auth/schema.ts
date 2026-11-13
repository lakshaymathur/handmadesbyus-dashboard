import { z } from "zod";

/**
 * Usernames, matching Better Auth's username plugin (3–30 characters: letters, digits,
 * _ and .). Stored lower-case. Anything else could be created but never signed in with.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-zA-Z0-9_.]+$/, "Use only letters, digits, _ and .");

/** Passwords for new users; Better Auth enforces the same minimum (server.ts). */
export const newPasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters");

/** Login form. Used by the client form; Better Auth re-validates on the server. */
export const signInSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});

export type SignInInput = z.input<typeof signInSchema>;
