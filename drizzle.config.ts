import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env itself. Variables already set in the shell win.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
  // Only needed by commands that talk to the database (e.g. `drizzle-kit studio`).
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
