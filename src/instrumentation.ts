// Runs once when the Next.js server starts. Fail fast on bad configuration instead of
// on the first request that happens to need it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionEnv, getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();
    // `next start` and the standalone server run with NODE_ENV=production; `next build`
    // doesn't call register(), so builds don't need production settings.
    if (process.env.NODE_ENV === "production") assertProductionEnv(env);
  }
}
