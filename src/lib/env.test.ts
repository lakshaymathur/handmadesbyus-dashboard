import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  S3_ENDPOINT: "http://localhost:8333",
  S3_REGION: "us-east-1",
  S3_BUCKET: "files",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "super-secret-value",
  S3_FORCE_PATH_STYLE: "true",
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
