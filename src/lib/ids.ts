import { istYearMonth } from "./dates";

// Readable IDs shown to people: customers C-0001, orders HMU-YYMM-#### (IST year-month).
// The numbers come from per-kind counters in the database (allocated atomically, M1);
// this module only formats and reads them.

function assertSequence(seq: number): void {
  if (!Number.isSafeInteger(seq) || seq < 1) {
    throw new RangeError(
      `Sequence must be a positive whole number, got ${seq}`,
    );
  }
}

/** 1 → "C-0001". Grows past 4 digits instead of wrapping: 12345 → "C-12345". */
export function formatCustomerId(seq: number): string {
  assertSequence(seq);
  return `C-${String(seq).padStart(4, "0")}`;
}

/** Reads "C-0001", "c-1" or "C1" back to 1. Returns null for anything else. */
export function parseCustomerId(text: string): number | null {
  const m = /^c-?(\d{1,9})$/i.exec(text.trim());
  const seq = m ? Number(m[1]) : 0;
  return seq >= 1 ? seq : null;
}

/** "HMU-2611" for an order placed in November 2026 (IST). */
export function orderIdPrefix(placedAt: Date): string {
  const { year, month } = istYearMonth(placedAt);
  return `HMU-${String(year % 100).padStart(2, "0")}${String(month).padStart(2, "0")}`;
}

/** The 42nd order of November 2026 (IST) → "HMU-2611-0042". */
export function formatOrderId(placedAt: Date, seq: number): string {
  assertSequence(seq);
  return `${orderIdPrefix(placedAt)}-${String(seq).padStart(4, "0")}`;
}

export type OrderIdParts = { year: number; month: number; seq: number };

/**
 * Reads "HMU-2611-0042" (any case, dashes optional: "hmu26110042") into its parts.
 * `year` is the full year (2026). Returns null for anything else.
 */
export function parseOrderId(text: string): OrderIdParts | null {
  const m = /^hmu-?(\d{2})(\d{2})-?(\d{4,9})$/i.exec(text.trim());
  if (!m) return null;
  const year = 2000 + Number(m[1]);
  const month = Number(m[2]);
  const seq = Number(m[3]);
  if (month < 1 || month > 12 || seq < 1) return null;
  return { year, month, seq };
}
