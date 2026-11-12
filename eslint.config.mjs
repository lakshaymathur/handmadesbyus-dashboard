import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";

// Hard rule (CLAUDE.md): plain Postgres + S3 API only, no vendor-specific SDKs.
const vendorSdkPatterns = [
  {
    group: [
      "aws-sdk",
      "aws-sdk/*",
      "@aws-sdk/*",
      "@aws-amplify/*",
      "aws-amplify",
    ],
    message:
      "No AWS SDKs: keep hosting portable. Use the S3 helper in @/lib/storage.",
  },
  {
    group: ["@supabase/*"],
    message:
      "No Supabase SDKs: keep hosting portable (plain Postgres + S3 API).",
  },
  {
    group: ["@vercel/*"],
    message: "No Vercel SDKs: keep hosting portable.",
  },
];

// Quality rule (CLAUDE.md): database access only in src/db and features/*/{queries,actions}.ts.
// Type-only imports (e.g. `import type { Order } from "@/db/schema"`) are allowed everywhere.
const dbAccessPatterns = [
  {
    regex: "^(@/db|(\\.\\.?/)+(.+/)?db)(/.*)?$",
    allowTypeImports: true,
    message:
      "Database access belongs in src/db or features/*/queries.ts / actions.ts. Call a query or action instead.",
  },
  {
    group: ["drizzle-orm", "drizzle-orm/*", "pg", "postgres"],
    allowTypeImports: true,
    message:
      "Database access belongs in src/db or features/*/queries.ts / actions.ts. Call a query or action instead.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintComments.recommended,
  {
    rules: {
      // `any` / `@ts-ignore` only with a written reason (CLAUDE.md).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          minimumDescriptionLength: 10,
        },
      ],
      // An eslint-disable comment must say why: `// eslint-disable-next-line rule -- reason`.
      "@eslint-community/eslint-comments/require-description": [
        "error",
        { ignore: [] },
      ],
      "@eslint-community/eslint-comments/disable-enable-pair": [
        "error",
        { allowWholeFile: true },
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [...vendorSdkPatterns, ...dbAccessPatterns] },
      ],
    },
  },
  {
    // The data layer may import the database; vendor SDKs stay banned.
    files: [
      "src/db/**",
      "src/features/*/queries.ts",
      "src/features/*/actions.ts",
      "**/*.int.test.ts",
      "drizzle.config.ts",
      "scripts/**",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: vendorSdkPatterns },
      ],
    },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".docker-data/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
