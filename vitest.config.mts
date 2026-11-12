import { defineConfig } from "vitest/config";

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
          // Tests share one test database, so run files one at a time.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
