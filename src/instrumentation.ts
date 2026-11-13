// Runs once when the Next.js server starts. Fail fast on bad configuration instead of
// on the first request that happens to need it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServerEnv } = await import("@/lib/env");
    getServerEnv();
  }
}
