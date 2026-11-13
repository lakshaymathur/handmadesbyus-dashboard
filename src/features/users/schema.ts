import { z } from "zod";
import { newPasswordSchema, usernameSchema } from "@/features/auth/schema";

// User management (Settings → Users, §3.7 and §4). Usernames can't change after creation.

/** Better Auth user ids (ours are UUIDs; keep it loose but bounded). */
const userId = z.string().min(1).max(64);

const displayName = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z.string().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
  );

export const createUserSchema = z.object({
  name: displayName,
  username: usernameSchema,
  password: newPasswordSchema,
});

export const renameUserSchema = z.object({ id: userId, name: displayName });

export const resetPasswordSchema = z.object({
  id: userId,
  password: newPasswordSchema,
});

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: newPasswordSchema,
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the current one",
  });

export const setUserActiveSchema = z.object({
  id: userId,
  active: z.boolean(),
});
