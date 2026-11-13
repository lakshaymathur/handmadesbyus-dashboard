import { z } from "zod";

// Money is stored and computed as integer paise (₹1 = 100 paise), never floating-point
// rupees. Only this module converts between paise and what people read or type.

// en-IN always uses "." for decimals, so paise are appended as text: exact at any size.
const rupeeFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function assertPaise(paise: number): void {
  if (!Number.isSafeInteger(paise)) {
    throw new TypeError(`Money must be a whole number of paise, got ${paise}`);
  }
}

/** ₹1,23,456 for whole rupees, ₹1,234.50 when there are paise, -₹500 for refunds. */
export function formatMoney(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rest = abs % 100;
  const rupees = rupeeFormat.format((abs - rest) / 100); // exact: divisible by 100
  return rest === 0
    ? sign + rupees
    : `${sign}${rupees}.${String(rest).padStart(2, "0")}`;
}

// Optional minus and ₹/Rs/INR, then the rupees, then up to 2 decimals. Rupees are plain
// digits or correctly grouped: Indian 1,23,456 (groups of 2, last of 3) or Western
// 123,456 (groups of 3). Anything else ("12,34", "1,000,00") is ambiguous: reject it.
const RUPEES = String.raw`\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3}`;
const MONEY_INPUT = new RegExp(
  String.raw`^(-)?\s*(?:₹|rs\.?|inr)?\s*(${RUPEES})(?:\.(\d{1,2}))?$`,
  "i",
);

/**
 * Converts what someone typed ("1,23,456", "₹ 1234.5", "Rs. 500") into paise.
 * Returns null for anything that isn't a plain amount with at most 2 decimals.
 */
export function parseMoney(input: string): number | null {
  const match = MONEY_INPUT.exec(input.trim());
  if (!match) return null;
  const [, minus, rupeesText = "", decimals = ""] = match;
  const rupees = Number(rupeesText.replaceAll(",", ""));
  const paise = rupees * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return null;
  return minus && paise !== 0 ? -paise : paise;
}

/**
 * Zod field for a money input in a form: takes the typed text, outputs paise.
 * Negative amounts are rejected unless `allowNegative` (e.g. refunds).
 */
export function moneyField(options: { allowNegative?: boolean } = {}) {
  return z.string().transform((text, ctx) => {
    const paise = parseMoney(text);
    if (paise === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter an amount like 1,250 or 1250.50",
      });
      return z.NEVER;
    }
    if (paise < 0 && !options.allowNegative) {
      ctx.addIssue({ code: "custom", message: "Amount can't be negative" });
      return z.NEVER;
    }
    return paise;
  });
}

/** Paise as plain text for an input's default value: 123450 → "1234.50", 50000 → "500". */
export function paiseToInput(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rest = abs % 100;
  const rupees = (abs - rest) / 100;
  return rest === 0
    ? `${sign}${rupees}`
    : `${sign}${rupees}.${String(rest).padStart(2, "0")}`;
}
