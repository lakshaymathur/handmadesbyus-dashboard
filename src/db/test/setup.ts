// Vitest setup file for the integration project: runs in every test file.
// Each test starts with empty tables; each file closes its connection pool when done.
import { afterAll, beforeEach } from "vitest";
import { db } from "../client";
import { truncateAllTables } from "./truncate";

beforeEach(async () => {
  await truncateAllTables(db);
});

afterAll(async () => {
  await db.$client.end();
});
