import { z } from "zod";

// Two kinds of dates:
// - Moments (created_at, status changes): JS Date / timestamptz, shown in IST.
// - Calendar dates (delivered date, expense date): "YYYY-MM-DD" strings, like Postgres
//   `date` columns. They have no time zone, so they never shift by a day.

export const TIME_ZONE = "Asia/Kolkata";

/** A calendar date as "YYYY-MM-DD". */
export type DateOnly = string;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function assertValid(date: Date): void {
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");
}

/** A moment as DD/MM/YYYY in IST: 13/11/2026. */
export function formatDate(date: Date): string {
  assertValid(date);
  return dateFormat.format(date);
}

/** A moment as DD/MM/YYYY and time in IST: 13/11/2026, 3:45 pm. */
export function formatDateTime(date: Date): string {
  assertValid(date);
  return dateTimeFormat.format(date);
}

/** The IST calendar date of a moment: 2026-11-12T20:00Z → "2026-11-13". */
export function toDateOnly(date: Date): DateOnly {
  assertValid(date);
  return partsFormat.format(date); // en-CA formats as YYYY-MM-DD
}

/** Today's date in India. */
export function todayIST(now: Date = new Date()): DateOnly {
  return toDateOnly(now);
}

/** IST year and month (1–12) of a moment. Used for order IDs (HMU-YYMM-####). */
export function istYearMonth(date: Date): { year: number; month: number } {
  const [year, month] = toDateOnly(date).split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0 };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function toIso(year: number, month: number, day: number): DateOnly {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isDateOnly(value: string): value is DateOnly {
  const m = ISO_DATE.exec(value);
  return !!m && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** "2026-11-13" → "13/11/2026". */
export function formatDateOnly(date: DateOnly): string {
  if (!isDateOnly(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Reads a date as people in India write it (day first): "13/11/2026", "3/1/2026",
 * "13-11-2026". Returns "YYYY-MM-DD", or null if it isn't a real date.
 */
export function parseDisplayDate(text: string): DateOnly | null {
  const m = DISPLAY_DATE.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  return isRealDate(year, month, day) ? toIso(year, month, day) : null;
}

/** Zod field for an <input type="date"> value (YYYY-MM-DD). */
export function dateOnlyField() {
  return z.string().refine(isDateOnly, { message: "Enter a valid date" });
}
