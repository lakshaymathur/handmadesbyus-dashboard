import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertProductionEnv,
  EXAMPLE_VALUES,
  parseServerEnv,
  productionEnvProblems,
} from "./env";

const valid = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  S3_ENDPOINT: "http://localhost:8333",
  S3_REGION: "us-east-1",
  S3_BUCKET: "files",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "super-secret-value",
  S3_FORCE_PATH_STYLE: "true",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("accepts the documented settings and converts types", () => {
    const env = parseServerEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it("defaults S3_FORCE_PATH_STYLE to false", () => {
    const { S3_FORCE_PATH_STYLE: _omit, ...rest } = valid;
    expect(parseServerEnv(rest).S3_FORCE_PATH_STYLE).toBe(false);
  });

  it("accepts the postgresql:// scheme too", () => {
    const url = "postgresql://user:pass@db.internal:5432/app";
    expect(parseServerEnv({ ...valid, DATABASE_URL: url }).DATABASE_URL).toBe(
      url,
    );
  });

  it("lists every missing variable in one error", () => {
    const { DATABASE_URL: _a, S3_BUCKET: _b, ...rest } = valid;
    expect(() => parseServerEnv(rest)).toThrowError(
      /DATABASE_URL: missing[\s\S]*S3_BUCKET: missing/,
    );
  });

  it("treats empty strings as missing", () => {
    expect(() => parseServerEnv({ ...valid, S3_REGION: "" })).toThrowError(
      /S3_REGION: missing/,
    );
  });

  it("rejects a non-Postgres database URL", () => {
    expect(() =>
      parseServerEnv({ ...valid, DATABASE_URL: "mysql://localhost/app" }),
    ).toThrowError(/DATABASE_URL:/);
  });

  it("rejects a short BETTER_AUTH_SECRET", () => {
    expect(() =>
      parseServerEnv({ ...valid, BETTER_AUTH_SECRET: "too-short" }),
    ).toThrowError(/BETTER_AUTH_SECRET: must be at least 32 characters/);
  });

  it("treats an empty optional setting as unset and uses its default", () => {
    const env = parseServerEnv({
      ...valid,
      S3_FORCE_PATH_STYLE: "",
      TRUSTED_ORIGINS: "",
    });
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.TRUSTED_ORIGINS).toEqual([]);
  });

  it("reads TRUSTED_ORIGINS as a list of origins", () => {
    const env = parseServerEnv({
      ...valid,
      TRUSTED_ORIGINS: "http://192.168.1.11:3000, https://dash.example.com/",
    });
    expect(env.TRUSTED_ORIGINS).toEqual([
      "http://192.168.1.11:3000",
      "https://dash.example.com",
    ]);
  });

  it("rejects a trusted origin with a path", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        TRUSTED_ORIGINS: "https://dash.example.com/app",
      }),
    ).toThrowError(/TRUSTED_ORIGINS: must be an origin/);
  });

  it("defaults the client IP header and reads trusted proxies", () => {
    const env = parseServerEnv({
      ...valid,
      TRUSTED_PROXIES: "10.0.0.0/8, 172.17.0.1",
    });
    expect(env.CLIENT_IP_HEADERS).toEqual(["x-forwarded-for"]);
    expect(env.TRUSTED_PROXIES).toEqual(["10.0.0.0/8", "172.17.0.1"]);
    expect(() =>
      parseServerEnv({ ...valid, TRUSTED_PROXIES: "not an ip" }),
    ).toThrowError(/TRUSTED_PROXIES:/);
  });

  it("rejects a non-boolean S3_FORCE_PATH_STYLE", () => {
    expect(() =>
      parseServerEnv({ ...valid, S3_FORCE_PATH_STYLE: "sometimes" }),
    ).toThrowError(/S3_FORCE_PATH_STYLE:/);
  });

  it("never puts values in the error message", () => {
    const secret = "postgres://admin:hunter2-very-secret@";
    let message = "";
    try {
      parseServerEnv({
        ...valid,
        DATABASE_URL: secret,
        S3_ENDPOINT: "not a url",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("not a url");
  });
});

describe("production settings", () => {
  const env = parseServerEnv({
    ...valid,
    BETTER_AUTH_SECRET: "a-real-production-secret-with-entropy-xyz",
    TRUSTED_PROXIES: "10.0.0.0/8",
  });

  it("accepts a real secret with x-forwarded-for behind listed proxies", () => {
    expect(productionEnvProblems(env)).toEqual([]);
    expect(() => assertProductionEnv(env)).not.toThrow();
  });

  it("refuses the public example secret", () => {
    const problems = productionEnvProblems({
      ...env,
      BETTER_AUTH_SECRET: EXAMPLE_VALUES.BETTER_AUTH_SECRET,
    });
    expect(problems.join()).toMatch(
      /BETTER_AUTH_SECRET: is the public example/,
    );
  });

  it("refuses x-forwarded-for with no trusted proxies (spoofable client IP)", () => {
    const unsafe = { ...env, TRUSTED_PROXIES: [] };
    expect(() => assertProductionEnv(unsafe)).toThrow(
      /TRUSTED_PROXIES: must list/,
    );
    expect(
      assertProductionEnv.bind(null, {
        ...unsafe,
        CLIENT_IP_HEADERS: ["X-Forwarded-For"],
      }),
    ).toThrow(/TRUSTED_PROXIES/);
  });

  it("accepts a proxy-set header such as x-real-ip without trusted proxies", () => {
    expect(
      productionEnvProblems({
        ...env,
        TRUSTED_PROXIES: [],
        CLIENT_IP_HEADERS: ["x-real-ip"],
      }),
    ).toEqual([]);
  });

  it("knows the example values actually published in .env.example", () => {
    const example = readFileSync(
      fileURLToPath(new URL("../../.env.example", import.meta.url)),
      "utf8",
    );
    for (const [name, value] of Object.entries(EXAMPLE_VALUES)) {
      expect(example).toMatch(new RegExp(`^${name}=${value}$`, "m"));
    }
  });
});
