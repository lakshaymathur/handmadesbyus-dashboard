import { z } from "zod";

// Sizes are stored as whole millimetres and weights as whole grams (integers, like
// money). People type sizes in centimetres (§2.2), so only this module converts.

const CM_INPUT = /^(\d{1,4})(?:\.(\d))?$/;

/** "12" → 120, "12.5" → 125 (mm). Null for anything else (blank, "12.55", "-1", "abc"). */
export function parseCm(text: string): number | null {
  const match = CM_INPUT.exec(text.trim());
  if (!match) return null;
  const [, whole = "0", tenth = "0"] = match;
  return Number(whole) * 10 + Number(tenth);
}

/** 125 → "12.5", 120 → "12" (for an input's starting value). */
export function mmToCmInput(mm: number): string {
  return mm % 10 === 0 ? String(mm / 10) : (mm / 10).toFixed(1);
}

/** Optional size typed in cm: blank → null, otherwise whole mm, at most 1 decimal. */
export function optionalCmField() {
  return z.string().transform((text, ctx) => {
    if (text.trim() === "") return null;
    const mm = parseCm(text);
    if (mm === null || mm === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Enter centimetres, like 20 or 12.5",
      });
      return z.NEVER;
    }
    return mm;
  });
}

/** Optional weight typed in whole grams, up to 100 kg. */
export function optionalGramsField() {
  return z.string().transform((text, ctx) => {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const grams = /^\d{1,6}$/.test(trimmed) ? Number(trimmed) : NaN;
    if (!(grams > 0 && grams <= 100_000)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter whole grams, like 350",
      });
      return z.NEVER;
    }
    return grams;
  });
}

/** "20 × 20 × 10 cm", with "?" for a missing side; null when no side is known. */
export function formatSize(
  lengthMm: number | null,
  widthMm: number | null,
  heightMm: number | null,
): string | null {
  const sides = [lengthMm, widthMm, heightMm];
  if (sides.every((s) => s === null)) return null;
  return `${sides.map((s) => (s === null ? "?" : mmToCmInput(s))).join(" × ")} cm`;
}

/** 350 → "350 g", 1250 → "1.25 kg". */
export function formatWeight(grams: number): string {
  return grams < 1000
    ? `${grams} g`
    : `${(grams / 1000).toFixed(3).replace(/\.?0+$/, "")} kg`;
}
