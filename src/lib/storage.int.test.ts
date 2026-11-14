import { describe, expect, it } from "vitest";
import { getStorage, newKey } from "./storage";

// Runs against the real local S3 (SeaweedFS from docker compose).
describe("storage against local S3", () => {
  const storage = getStorage();

  it("uploads, serves through a signed URL, and deletes", async () => {
    const key = newKey("test", "hello.txt");
    await storage.put(key, "hello from the test", "text/plain");
    expect(await storage.exists(key)).toBe(true);

    const response = await fetch(await storage.signedUrl(key, 60));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("hello from the test");

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await storage.delete(key); // deleting again is fine
  });

  it("streams a file back, with its size, and returns null for a missing one", async () => {
    const key = newKey("test", "stream.bin");
    const bytes = new Uint8Array(1000).map((_, i) => i % 251);
    await storage.put(key, bytes, "application/octet-stream");
    const file = await storage.get(key);
    expect(file?.size).toBe(1000);
    expect(
      new Uint8Array(await new Response(file?.body).arrayBuffer()),
    ).toEqual(bytes);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("stores binary files byte for byte", async () => {
    const key = newKey("test", "photo.jpg");
    const bytes = new Uint8Array(256).map((_, i) => i);
    await storage.put(key, bytes, "image/jpeg");
    const response = await fetch(await storage.signedUrl(key));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    await storage.delete(key);
  });

  it("keeps the bucket private: no access without a valid signature", async () => {
    const key = newKey("test", "private.txt");
    await storage.put(key, "secret", "text/plain");
    const signed = new URL(await storage.signedUrl(key, 60));

    const unsigned = new URL(signed);
    unsigned.search = "";
    expect((await fetch(unsigned)).status).toBe(403);

    const tampered = new URL(signed);
    tampered.searchParams.set("X-Amz-Signature", "0".repeat(64));
    expect((await fetch(tampered)).status).toBe(403);

    await storage.delete(key);
  });

  it("stops serving a signed URL once it expires", async () => {
    const key = newKey("test", "short.txt");
    await storage.put(key, "brief", "text/plain");
    const url = await storage.signedUrl(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect((await fetch(url)).status).toBe(403);
    await storage.delete(key);
  });

  it("rejects out-of-range expiry", async () => {
    await expect(storage.signedUrl("test/x.txt", 0)).rejects.toThrow(
      RangeError,
    );
    await expect(
      storage.signedUrl("test/x.txt", 8 * 24 * 3600),
    ).rejects.toThrow(RangeError);
  });
});
