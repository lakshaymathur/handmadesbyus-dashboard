import { randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { getServerEnv } from "./env";

// File storage over the plain S3 API (SeaweedFS locally, any S3-compatible service in
// production). The bucket is private: show files through short-lived signed URLs.
// Server-only: it holds the storage secret.

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type Storage = {
  /** Uploads (or replaces) a file. */
  put(
    key: string,
    body: Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | string,
    contentType: string,
  ): Promise<void>;
  /** Streams a file, or null if there's none at `key`. */
  get(
    key: string,
  ): Promise<{ body: ReadableStream<Uint8Array>; size: number | null } | null>;
  /** True if a file exists at `key`. */
  exists(key: string): Promise<boolean>;
  /** Deletes a file. Deleting a missing file is not an error. */
  delete(key: string): Promise<void>;
  /** A URL anyone holding it can GET for `expiresInSeconds` (default 1 hour). */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
};

// Folders, then a file name: letters, digits, - _ . only. No "..", no leading "/".
const KEY = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*$/i;

/** Throws unless `key` is a safe object key such as "products/3f2a….jpg". */
export function assertValidKey(key: string): void {
  if (key.length > 512 || !KEY.test(key) || key.includes("..")) {
    throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  }
}

/**
 * A new unguessable key in `folder`, keeping a safe extension from `fileName`:
 * newKey("products", "Red Box.JPG") → "products/<uuid>.jpg".
 */
export function newKey(folder: string, fileName = ""): string {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(fileName)?.[1]?.toLowerCase();
  const key = `${folder}/${randomUUID()}${ext ? `.${ext}` : ""}`;
  assertValidKey(key);
  return key;
}

/** The object's URL, path-style (http://host/bucket/key) or virtual-hosted. */
export function objectUrl(config: StorageConfig, key: string): URL {
  assertValidKey(key);
  const base = new URL(config.endpoint);
  if (config.forcePathStyle) {
    return new URL(
      `${base.pathname.replace(/\/$/, "")}/${config.bucket}/${key}`,
      base,
    );
  }
  base.hostname = `${config.bucket}.${base.hostname}`;
  return new URL(`${base.pathname.replace(/\/$/, "")}/${key}`, base);
}

const MAX_SIGNED_URL_SECONDS = 7 * 24 * 60 * 60; // S3's limit

export function createStorage(config: StorageConfig): Storage {
  // Few retries: a failing upload should fail the action quickly, not hang it.
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
    retries: 2,
  });

  async function send(
    method: string,
    key: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return client.fetch(objectUrl(config, key).toString(), { ...init, method });
  }

  async function fail(
    action: string,
    key: string,
    response: Response,
  ): Promise<never> {
    // Body is S3's XML error; keep it out of user-facing messages but log-friendly.
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `Storage ${action} failed for ${key}: HTTP ${response.status} ${detail}`,
    );
  }

  return {
    async put(key, body, contentType) {
      const response = await send("PUT", key, {
        body,
        headers: { "content-type": contentType },
      });
      if (!response.ok) await fail("upload", key, response);
    },

    async get(key) {
      const response = await send("GET", key);
      if (response.status === 404) return null;
      if (!response.ok || !response.body) await fail("download", key, response);
      const header = response.headers.get("content-length");
      const length = header === null ? NaN : Number(header);
      return {
        // Checked just above: fail() throws when there's no body.
        body: response.body as ReadableStream<Uint8Array>,
        size: Number.isSafeInteger(length) && length >= 0 ? length : null,
      };
    },

    async exists(key) {
      const response = await send("HEAD", key);
      if (response.status === 404) return false;
      if (!response.ok) await fail("check", key, response);
      return true;
    },

    async delete(key) {
      const response = await send("DELETE", key);
      if (!response.ok && response.status !== 404)
        await fail("delete", key, response);
    },

    async signedUrl(key, expiresInSeconds = 3600) {
      if (
        !Number.isInteger(expiresInSeconds) ||
        expiresInSeconds < 1 ||
        expiresInSeconds > MAX_SIGNED_URL_SECONDS
      ) {
        throw new RangeError(
          `expiresInSeconds must be 1–${MAX_SIGNED_URL_SECONDS}`,
        );
      }
      const url = objectUrl(config, key);
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      const signed = await client.sign(url.toString(), {
        method: "GET",
        aws: { signQuery: true },
      });
      return signed.url;
    },
  };
}

let shared: Storage | undefined;

/** The app's storage, configured from S3_* settings (see .env.example). */
export function getStorage(): Storage {
  if (!shared) {
    const env = getServerEnv();
    shared = createStorage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return shared;
}
