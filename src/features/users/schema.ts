import { z } from "zod";
import { newPasswordSchema, usernameSchema } from "@/features/auth/schema";
import { nameSchema } from "@/lib/validation";

// User management (Settings → Users, §3.7 and §4). Usernames can't change after creation.

/** Better Auth user ids (ours are UUIDs; keep it loose but bounded). */
const userId = z.string().min(1).max(64);

export const createUserSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  password: newPasswordSchema,
});

export const renameUserSchema = z.object({ id: userId, name: nameSchema });

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
