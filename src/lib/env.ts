import { z } from "zod";

/** A comma-separated setting ("a, b,c") as a list; empty entries are dropped. */
function csvList(item: z.ZodType<string, string>) {
  return z
    .string()
    .transform((text) =>
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item));
}

/** An origin only: scheme + host (+ port), no path. e.g. http://192.168.1.11:3000 */
const origin = z
  .url({ protocol: /^https?$/ })
  .refine((value) => new URL(value).origin === value.replace(/\/$/, ""), {
    message: "must be an origin like https://host:port, without a path",
  })
  .transform((value) => new URL(value).origin);

// Every setting the server reads, validated once. Keep in sync with `.env.example`.
const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),

  // Signs session cookies. Generate with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Public URL of the app, e.g. https://dashboard.example.com
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  // Other addresses people open the app at, e.g. a phone on the LAN: http://192.168.1.11:3000
  TRUSTED_ORIGINS: csvList(origin).default([]),
  // Request headers that carry the client's IP (for sign-in rate limiting), first match wins.
  CLIENT_IP_HEADERS: csvList(z.string().regex(/^[a-z0-9-]+$/i)).default([
    "x-forwarded-for",
  ]),
  // Reverse proxies (IPs or CIDR ranges) allowed to append to x-forwarded-for.
  TRUSTED_PROXIES: csvList(
    z.string().regex(/^[0-9a-f.:]+(\/\d{1,3})?$/i),
  ).default([]),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validates `source` against `schema`. Empty values count as unset, so optional settings
 * fall back to their defaults. Throws one error listing every missing or invalid
 * variable; values are never included in the message (they may be secrets).
 */
export function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined>,
  heading = "Invalid environment variables",
): z.output<Schema> {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? "");
    return cleaned[name] === undefined
      ? `  ${name}: missing`
      : `  ${name}: ${issue.message}`;
  });
  throw new Error(`${heading} (see .env.example):\n${problems.join("\n")}`);
}

/** Validates the server settings in `source` (see parseEnv). */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  return parseEnv(serverEnvSchema, source);
}

let cached: ServerEnv | undefined;

/** Server settings from `process.env`, validated on first use and cached. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
