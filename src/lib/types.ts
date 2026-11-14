/**
 * `true` only when A and B are the same type. For compile-time checks that a list in the
 * app matches a Postgres enum: `const ok: Same<Mine, (typeof dbEnum.enumValues)[number]> = true;`
 */
export type Same<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
