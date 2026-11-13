import { z } from "zod";
import { connect } from "./connect";
import { createUserWithPassword } from "./users";

const seedEnvSchema = z.object({
  SEED_USER_USERNAME: z.string().trim().min(3),
  SEED_USER_NAME: z.string().trim().min(1),
  SEED_USER_PASSWORD: z.string().min(10, "must be at least 10 characters"),
});

/**
 * Loads starting data into the database at `url`. Safe to run more than once.
 * Creates the first login user from SEED_USER_* (see .env.example). Sample business data
 * arrives with M1.
 */
export async function seed(url: string): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(
      `Seed settings missing or invalid (see .env.example):\n${names.join("\n")}`,
    );
  }
  const env = parsed.data;

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
