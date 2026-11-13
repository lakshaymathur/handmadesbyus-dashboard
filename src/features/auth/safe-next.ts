/**
 * Where to go after signing in. Only same-site paths are allowed, so a crafted link like
 * /login?next=https://evil.example can't bounce a user to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  // "//host" and "/\host" are treated as other origins by browsers.
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === "/login" || next.startsWith("/login?")) return "/";
  return next;
}
