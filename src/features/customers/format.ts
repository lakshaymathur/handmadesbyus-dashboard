// Display helpers for customers, safe on client and server.

/** "9810000001" → "98100 00001" (how Indian mobiles are usually written). */
export function formatMobile(mobile: string): string {
  return /^\d{10}$/.test(mobile)
    ? `${mobile.slice(0, 5)} ${mobile.slice(5)}`
    : mobile;
}

/** "Ananya Sharma", or just "Rohit" when there's no last name. */
export function customerName(c: {
  firstName: string;
  lastName: string | null;
}): string {
  return c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName;
}

/** One-line address: "12, Rose Apartments, MG Road, Jaipur, Rajasthan 302001". */
export function formatAddress(a: {
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pin: string;
}): string {
  return [
    a.line1,
    a.line2,
    a.landmark, // typed as people say it: "Near Hanuman temple", "Opp. bus stand"
    a.city,
    `${a.state} ${a.pin}`,
  ]
    .filter(Boolean)
    .join(", ");
}
