import { z } from "zod";

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
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validates `source` and returns typed settings, or throws one error listing every
 * missing or invalid variable. Values are never included in the message (they may be secrets).
 */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join(".");
    return source[name] === undefined || source[name] === ""
      ? `  ${name}: missing`
      : `  ${name}: ${issue.message}`;
  });
  throw new Error(
    `Invalid environment variables (see .env.example):\n${problems.join("\n")}`,
  );
}

let cached: ServerEnv | undefined;

/** Server settings from `process.env`, validated on first use and cached. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
