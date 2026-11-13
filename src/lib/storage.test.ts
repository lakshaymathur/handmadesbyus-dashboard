import { describe, expect, it } from "vitest";
import {
  assertValidKey,
  newKey,
  objectUrl,
  type StorageConfig,
} from "./storage";

const config: StorageConfig = {
  endpoint: "http://localhost:8333",
  region: "us-east-1",
  bucket: "files",
  accessKeyId: "key",
  secretAccessKey: "secret",
  forcePathStyle: true,
};

describe("storage keys", () => {
  it("creates unguessable keys in a folder, keeping a safe lower-case extension", () => {
    const key = newKey("products", "Red Box.JPG");
    expect(key).toMatch(/^products\/[0-9a-f-]{36}\.jpg$/);
    expect(newKey("products", "Red Box.JPG")).not.toBe(key);
  });

  it("drops odd or missing extensions", () => {
    expect(newKey("products", "photo")).toMatch(/^products\/[0-9a-f-]{36}$/);
    expect(newKey("products", "x.<script>")).toMatch(
      /^products\/[0-9a-f-]{36}$/,
    );
  });

  it.each(["products/abc.jpg", "a/b/c.png", "file"])("accepts %s", (key) => {
    expect(() => assertValidKey(key)).not.toThrow();
  });

  it.each([
    "",
    "/products/a.jpg",
    "products/../secret",
    "products/",
    "products//a.jpg",
    "products/a b.jpg",
    "products/a?x=1",
    "products/%2e%2e/a",
    `products/${"a".repeat(600)}`,
  ])("rejects %j", (key) => {
    expect(() => assertValidKey(key)).toThrow(/Invalid storage key/);
  });

  it("refuses to build a URL for an invalid key", () => {
    expect(() => objectUrl(config, "../etc/passwd")).toThrow(
      /Invalid storage key/,
    );
  });
});

describe("objectUrl", () => {
  it("uses path style (http://host/bucket/key) for SeaweedFS and MinIO-style servers", () => {
    expect(objectUrl(config, "products/a.jpg").toString()).toBe(
      "http://localhost:8333/files/products/a.jpg",
    );
  });

  it("uses virtual-hosted style (http://bucket.host/key) otherwise", () => {
    const url = objectUrl(
      { ...config, endpoint: "https://s3.example.com", forcePathStyle: false },
      "products/a.jpg",
    );
    expect(url.toString()).toBe("https://files.s3.example.com/products/a.jpg");
  });

  it("keeps an endpoint path prefix", () => {
    const url = objectUrl(
      { ...config, endpoint: "https://gw.example.com/s3/" },
      "a.jpg",
    );
    expect(url.toString()).toBe("https://gw.example.com/s3/files/a.jpg");
  });
});
