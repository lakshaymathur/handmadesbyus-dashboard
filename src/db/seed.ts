import { z } from "zod";
import { newPasswordSchema, usernameSchema } from "@/features/auth/schema";
import { parseEnv } from "@/lib/env";
import { connect } from "./connect";
import { createUserWithPassword } from "./users";

const seedEnvSchema = z.object({
  SEED_USER_USERNAME: usernameSchema,
  SEED_USER_NAME: z.string().trim().min(1),
  SEED_USER_PASSWORD: newPasswordSchema,
});

/**
 * Loads starting data into the database at `url`. Safe to run more than once.
 * Creates the first login user from SEED_USER_* (see .env.example). Sample business data
 * arrives with M1.
 */
export async function seed(url: string): Promise<void> {
  const env = parseEnv(
    seedEnvSchema,
    process.env,
    "Seed settings missing or invalid",
  );

  const db = connect(url);
  try {
    const user = await createUserWithPassword(db, {
      username: env.SEED_USER_USERNAME,
      name: env.SEED_USER_NAME,
      password: env.SEED_USER_PASSWORD,
    });
    console.log(
      user.created
        ? `Created user "${env.SEED_USER_USERNAME}".`
        : `User "${env.SEED_USER_USERNAME}" already exists; left unchanged.`,
    );
  } finally {
    await db.$client.end();
  }
}
