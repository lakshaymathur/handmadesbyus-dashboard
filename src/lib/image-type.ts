// Identifies an uploaded image by its first bytes, never by its name or the type the
// browser claims: only these three formats are stored, and they're served with the type
// found here. SVG is deliberately not accepted (it can carry script).

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0) =>
  prefix.every((b, i) => bytes[offset + i] === b);

/** The image's real type from its magic bytes, or null if it's not JPEG, PNG or WebP. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // "RIFF" <4-byte size> "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}
