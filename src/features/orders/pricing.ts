// Order pricing (§2.4, §2.5). Everything is integer paise; nothing here reads the
// catalogue: prices and costs come from the order's own snapshots.

export type PricedCustomisation = { price: number; cost: number };

export type PricedItem = {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  customisations: PricedCustomisation[];
};

export type Discount =
  | { type: "none" }
  | { type: "flat"; paise: number }
  /** Basis points: 1250 = 12.5%. */
  | { type: "percent"; bp: number };

export type OrderPricing = {
  items: PricedItem[];
  discount: Discount;
  shippingCharged: number;
};

export type OrderTotals = {
  /** Σ line totals, customisations included. */
  subtotal: number;
  /** Of which customisations. */
  customisations: number;
  discount: number;
  shippingCharged: number;
  /** subtotal − discount + shipping charged. */
  total: number;
  /** What the items cost to make (for profit, §3.6). */
  cost: number;
};

function assertPaise(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${what} must be a whole, non-negative number of paise`,
    );
  }
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** One unit's price including its customisations. */
export function unitPriceWithExtras(item: PricedItem): number {
  return item.unitPrice + sum(item.customisations.map((c) => c.price));
}

/** Line total (§2.5): (unit price + customisation prices) × quantity. */
export function lineTotal(item: PricedItem): number {
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
    throw new RangeError("Quantity must be a whole number, at least 1");
  }
  assertPaise(item.unitPrice, "Unit price");
  for (const c of item.customisations)
    assertPaise(c.price, "Customisation price");
  return unitPriceWithExtras(item) * item.quantity;
}

/** What a line costs to make: (unit cost + customisation costs) × quantity. */
export function lineCost(item: PricedItem): number {
  assertPaise(item.unitCost, "Unit cost");
  for (const c of item.customisations)
    assertPaise(c.cost, "Customisation cost");
  return (
    (item.unitCost + sum(item.customisations.map((c) => c.cost))) *
    item.quantity
  );
}

/**
 * The discount in paise. Percentages round half up to the paisa
 * (12.5% of ₹10.01 = 125.125 paise → 125). Never more than the subtotal.
 */
export function discountAmount(subtotal: number, discount: Discount): number {
  assertPaise(subtotal, "Subtotal");
  switch (discount.type) {
    case "none":
      return 0;
    case "flat":
      assertPaise(discount.paise, "Discount");
      return Math.min(discount.paise, subtotal);
    case "percent": {
      if (
        !Number.isInteger(discount.bp) ||
        discount.bp < 0 ||
        discount.bp > 10_000
      ) {
        throw new RangeError("Discount percent must be 0–100%");
      }
      // Integer maths: subtotal × bp is at most ~2.1e13 for any order we store, well
      // within Number's exact range.
      return Math.floor((subtotal * discount.bp + 5_000) / 10_000);
    }
  }
}

/** Every total the order page and reports need. */
export function orderTotals(order: OrderPricing): OrderTotals {
  assertPaise(order.shippingCharged, "Shipping charged");
  const subtotal = sum(order.items.map(lineTotal));
  const customisations = sum(
    order.items.map(
      (i) => sum(i.customisations.map((c) => c.price)) * i.quantity,
    ),
  );
  const discount = discountAmount(subtotal, order.discount);
  return {
    subtotal,
    customisations,
    discount,
    shippingCharged: order.shippingCharged,
    total: subtotal - discount + order.shippingCharged,
    cost: sum(order.items.map(lineCost)),
  };
}

/** "12.5" → 1250 basis points; null unless 0–100 with at most 2 decimals. */
export function parsePercent(text: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(
    text.trim().replace(/%$/, "").trim(),
  );
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp <= 10_000 ? bp : null;
}

/** 1250 → "12.5", 1000 → "10" (for an input's starting value or display). */
export function percentToInput(bp: number): string {
  const whole = Math.floor(bp / 100);
  const rest = bp % 100;
  return rest === 0
    ? String(whole)
    : `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}
