// Browser only. Phone photos are 3–8 MB and 4000 px wide; product photos are shown at
// most a few hundred pixels wide. Shrinking before upload makes uploads fast on mobile
// data, keeps storage small, and re-encoding drops the photo's metadata (including GPS).

/** Longest side of a stored product photo, in pixels. */
export const PHOTO_MAX_SIDE = 1600;

/**
 * Re-encodes an image the browser can read as a JPEG at most PHOTO_MAX_SIDE on its
 * longest side, upright (EXIF rotation applied) and on white (for transparent PNGs).
 * Throws if the browser can't read the file as an image.
 */
export async function shrinkPhoto(file: File, quality = 0.85): Promise<File> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(
      1,
      PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Couldn't encode the photo");
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
