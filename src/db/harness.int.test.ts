// Smoke tests for the integration-test harness itself (src/db/test/*).
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EXAMPLE_VALUES } from "@/lib/env";
import { db } from "./client";
import { connect } from "./connect";
import { categories, users } from "./schema";
import { runMigrations } from "./migrate";
import { seed } from "./seed";

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

describe("reset refuses databases that aren't marked disposable", () => {
  it("won't wipe a local database without the disposable-local comment", async () => {
    const { resetDatabase } = await import("./reset");
    const probe = "hmu_unmarked_probe";
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS ${probe}`));
    await db.execute(sql.raw(`CREATE DATABASE ${probe}`));
    try {
      const url = new URL(process.env.TEST_DATABASE_URL ?? "");
      url.pathname = `/${probe}`;
      await expect(
        resetDatabase(url.toString(), { seed: false }),
      ).rejects.toThrow(/isn't marked as a disposable local database/);
    } finally {
      await db.execute(sql.raw(`DROP DATABASE IF EXISTS ${probe}`));
    }
  });
});

describe("seed refuses the example password outside disposable databases", () => {
  const probe = "hmu_seed_probe";
  const probeUrl = () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? "");
    url.pathname = `/${probe}`;
    return url.toString();
  };
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS ${probe}`));
    await db.execute(sql.raw(`CREATE DATABASE ${probe}`));
    await runMigrations(probeUrl());
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });
  afterAll(async () => {
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS ${probe}`));
  });

  it("won't create a user with the published example password", async () => {
    process.env.SEED_USER_USERNAME = "admin";
    process.env.SEED_USER_NAME = "Admin";
    process.env.SEED_USER_PASSWORD = EXAMPLE_VALUES.SEED_USER_PASSWORD;
    await expect(seed(probeUrl())).rejects.toThrow(
      /Refusing to seed "hmu_seed_probe" with the example SEED_USER_PASSWORD/,
    );
  });

  it("seeds it with a password of the operator's own", async () => {
    process.env.SEED_USER_USERNAME = "admin";
    process.env.SEED_USER_NAME = "Admin";
    process.env.SEED_USER_PASSWORD = "a-strong-operator-password";
    await expect(seed(probeUrl())).resolves.toBeUndefined();
    // Not a disposable database: the user only, never sample data.
    const probeDb = connect(probeUrl());
    try {
      expect(await probeDb.$count(users)).toBe(1);
      expect(await probeDb.$count(categories)).toBe(0);
    } finally {
      await probeDb.$client.end();
    }
  });
});
