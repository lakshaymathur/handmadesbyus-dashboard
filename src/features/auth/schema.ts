import { z } from "zod";

/** Login form. Used by the client form; Better Auth re-validates on the server. */
export const signInSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});

export type SignInInput = z.input<typeof signInSchema>;
