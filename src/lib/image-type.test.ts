import { describe, expect, it } from "vitest";
import { sniffImageType } from "./image-type";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) =>
      typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v],
    ),
  );

describe("sniffImageType", () => {
  it("knows JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe(
      "image/jpeg",
    );
    expect(
      sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)),
    ).toBe("image/png");
    expect(sniffImageType(bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 "))).toBe(
      "image/webp",
    );
  });

  it("refuses anything else, whatever it's called", () => {
    expect(sniffImageType(bytes("<svg xmlns=…"))).toBeNull();
    expect(sniffImageType(bytes("GIF89a"))).toBeNull();
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WAVEfmt "))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull(); // truncated
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
