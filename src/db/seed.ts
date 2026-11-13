import { z } from "zod";
import { newPasswordSchema, usernameSchema } from "@/features/auth/schema";
import { EXAMPLE_VALUES, parseEnv } from "@/lib/env";
import { connect } from "./connect";
import { describeDatabase } from "./disposable";
import { seedSampleData } from "./sample-data";
import { createUserWithPassword } from "./users";

const seedEnvSchema = z.object({
  SEED_USER_USERNAME: usernameSchema,
  SEED_USER_NAME: z.string().trim().min(1),
  SEED_USER_PASSWORD: newPasswordSchema,
});

/**
 * Loads starting data into the database at `url`. Safe to run more than once.
 * Creates the first login user from SEED_USER_* (see .env.example). On a disposable local
 * database it also loads sample business data (src/db/sample-data.ts); elsewhere it
 * never does.
 */
export async function seed(url: string): Promise<void> {
  const env = parseEnv(
    seedEnvSchema,
    process.env,
    "Seed settings missing or invalid",
  );

  const db = connect(url);
  try {
    const { name, disposable } = await describeDatabase(db);
    // The example password is public: only allow it on a local, disposable database.
    if (env.SEED_USER_PASSWORD === EXAMPLE_VALUES.SEED_USER_PASSWORD) {
      if (!disposable) {
        throw new Error(
          `Refusing to seed "${name}" with the example SEED_USER_PASSWORD from .env.example: ` +
            "it isn't a disposable local database. Set a strong SEED_USER_PASSWORD.",
        );
      }
    }
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
    if (disposable) {
      const { loaded } = await seedSampleData(db, user.id);
      console.log(
        loaded
          ? "Loaded sample data (categories, lists, options, products, customers)."
          : "Sample data skipped: categories already exist.",
      );
    }
  } finally {
    await db.$client.end();
  }
}
