function pgError(error: unknown, code: string): string | null {
  for (let e = error; e instanceof Error; e = e.cause) {
    const { code: c, constraint } = e as {
      code?: unknown;
      constraint?: unknown;
    };
    if (c === code) return typeof constraint === "string" ? constraint : "";
  }
  return null;
}

/**
 * The constraint name if `error` is a foreign-key violation (SQLSTATE 23503), e.g.
 * deleting a row that other rows still point at. Otherwise null.
 */
export function foreignKeyViolation(error: unknown): string | null {
  return pgError(error, "23503");
}

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
