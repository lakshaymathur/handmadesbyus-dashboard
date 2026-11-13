// Smoke tests for the integration-test harness itself (src/db/test/*).
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./client";

describe("integration test harness", () => {
  it("connects the app's db client to the test database, not the dev one", async () => {
    const testDbName = new URL(
      process.env.TEST_DATABASE_URL ?? "",
    ).pathname.slice(1);
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(testDbName).not.toBe("");
    expect(rows[0]?.name).toBe(testDbName);
  });

  describe("cleans tables between tests", () => {
    // A throwaway table; the global setup drops it again on the next run.
    beforeAll(async () => {
      await db.execute(
        sql`CREATE TABLE IF NOT EXISTS harness_probe (id serial PRIMARY KEY, note text NOT NULL)`,
      );
    });

    const count = async () => {
      const { rows } = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM harness_probe`,
      );
      return rows[0]?.n;
    };

    it("writes a row", async () => {
      await db.execute(
        sql`INSERT INTO harness_probe (note) VALUES ('first test')`,
      );
      expect(await count()).toBe(1);
    });

    it("starts the next test with the table empty and IDs restarted", async () => {
      expect(await count()).toBe(0);
      const { rows } = await db.execute<{ id: number }>(
        sql`INSERT INTO harness_probe (note) VALUES ('second test') RETURNING id`,
      );
      expect(rows[0]?.id).toBe(1);
    });
  });
});
