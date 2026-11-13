// Resolved against a placeholder origin to see where the browser would really go.
const BASE = "http://app.invalid";

/**
 * Where to go after signing in. Only same-site paths are allowed, so a crafted link like
 * /login?next=https://evil.example can't bounce a user to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  // Browsers drop tabs/newlines and treat "\" as "/" when resolving a URL, so
  // "/<TAB>/evil.example" or "/\evil.example" would become "//evil.example".
  if (/[\s\\\u0000-\u001f\u007f]/.test(next)) return "/";

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  if (url.pathname.replace(/\/+$/, "") === "/login") return "/";
  return url.pathname + url.search + url.hash;
}
