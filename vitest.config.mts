import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Load .env like Next.js does. Variables already set in the shell win.
if (existsSync(".env")) process.loadEnvFile(".env");

// Remember the dev database before integration workers swap it out, so the global setup
// can refuse to run if TEST_DATABASE_URL points at the same database.
process.env.DEV_DATABASE_URL ??= process.env.DATABASE_URL;

// Two projects:
//   unit        → `*.test.ts` next to the code, pure logic, no DB (`npm test`)
//   integration → `*.int.test.ts`, server actions against the test Postgres (`npm run test:integration`)
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "*.test.ts"],
          exclude: ["**/*.int.test.ts", "node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.int.test.ts"],
          // Code under test uses the normal `db` client, which reads DATABASE_URL:
          // point it at the test database.
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
          // Once per run: wipe the test database and apply all migrations.
          globalSetup: ["src/db/test/global-setup.ts"],
          // Every file: empty all tables before each test, close the pool after.
          setupFiles: ["src/db/test/setup.ts"],
          // Tests share one test database, so run files one at a time.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
