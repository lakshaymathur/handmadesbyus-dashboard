import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Guards the custom lint rules from CLAUDE.md so a config change can't silently disable them.
const eslint = new ESLint({ cwd: import.meta.dirname });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const messages = result?.messages ?? [];
  // A parse error would make the "allows" assertions pass vacuously.
  const fatal = messages.find((m) => m.fatal);
  if (fatal) throw new Error(`Snippet failed to parse: ${fatal.message}`);
  return messages.map((m) => m.ruleId ?? m.message);
}

const RESTRICTED = "@typescript-eslint/no-restricted-imports";

describe("vendor SDK ban", () => {
  it.each([
    'import { S3Client } from "@aws-sdk/client-s3";',
    'import { createClient } from "@supabase/supabase-js";',
    'import { put } from "@vercel/blob";',
  ])("rejects %s, even in the data layer", async (code) => {
    expect(await ruleIds(code, "src/lib/storage.ts")).toContain(RESTRICTED);
    expect(await ruleIds(code, "src/db/client.ts")).toContain(RESTRICTED);
  });
});

describe("database access boundary", () => {
  const dbImports = [
    'import { db } from "@/db/client";',
    'import { db } from "@/db";',
    'import { db } from "../../db/client";',
    'import { eq } from "drizzle-orm";',
  ];

  it.each(dbImports)("rejects %s in components and pages", async (code) => {
    expect(
      await ruleIds(code, "src/features/orders/components/order-card.tsx"),
    ).toContain(RESTRICTED);
    expect(await ruleIds(code, "src/app/orders/page.tsx")).toContain(
      RESTRICTED,
    );
  });

  it.each(dbImports)(
    "allows %s in queries, actions, src/db and integration tests",
    async (code) => {
      for (const file of [
        "src/features/orders/queries.ts",
        "src/features/orders/actions.ts",
        "src/db/seed.ts",
        "src/features/orders/actions.int.test.ts",
      ]) {
        expect(await ruleIds(code, file)).not.toContain(RESTRICTED);
      }
    },
  );

  it("allows type-only schema imports anywhere", async () => {
    const code =
      'import type { Order } from "@/db/schema";\nexport type X = Order;';
    expect(
      await ruleIds(code, "src/features/orders/components/order-card.tsx"),
    ).not.toContain(RESTRICTED);
  });

  it("does not flag unrelated paths containing 'db'", async () => {
    const code = 'import { x } from "@/lib/dbutils";\nexport const y = x;';
    expect(await ruleIds(code, "src/app/page.tsx")).not.toContain(RESTRICTED);
  });
});

describe("escape hatches need a reason", () => {
  it("rejects a bare @ts-ignore but allows one with a description", async () => {
    expect(
      await ruleIds("// @ts-ignore\nexport const a = 1;", "src/lib/a.ts"),
    ).toContain("@typescript-eslint/ban-ts-comment");
    expect(
      await ruleIds(
        "// @ts-ignore -- library types are wrong here\nexport const a = 1;",
        "src/lib/a.ts",
      ),
    ).not.toContain("@typescript-eslint/ban-ts-comment");
  });

  it("rejects an eslint-disable comment without a description", async () => {
    const bare =
      "// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a: any = 1;";
    const reasoned =
      "// eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party callback is untyped\nexport const a: any = 1;";
    expect(await ruleIds(bare, "src/lib/a.ts")).toContain(
      "@eslint-community/eslint-comments/require-description",
    );
    expect(await ruleIds(reasoned, "src/lib/a.ts")).toEqual([]);
  });
});
