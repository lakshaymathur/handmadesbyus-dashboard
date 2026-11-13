import { getServerEnv } from "@/lib/env";
import { connect, type Database } from "./connect";

// One pool per server process. In dev, hot reloads re-run this module, so the pool is
// kept on globalThis to avoid opening a new one on every edit.
const globalForDb = globalThis as typeof globalThis & { __db?: Database };

export const db: Database =
  globalForDb.__db ?? connect(getServerEnv().DATABASE_URL);

// Development only: test workers must each get (and close) their own pool.
if (process.env.NODE_ENV === "development") globalForDb.__db = db;
