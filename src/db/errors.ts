/**
 * The constraint name if `error` (or anything in its `cause` chain; Drizzle wraps driver
 * errors) is a Postgres unique violation (SQLSTATE 23505). Otherwise null.
 */
export function uniqueViolation(error: unknown): string | null {
  for (let e = error; e instanceof Error; e = e.cause) {
    const { code, constraint } = e as { code?: unknown; constraint?: unknown };
    if (code === "23505")
      return typeof constraint === "string" ? constraint : "";
  }
  return null;
}
