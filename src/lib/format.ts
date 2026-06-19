// Currency symbols shown as a value prefix throughout the app.
// Codes mirror SUPPORTED_CURRENCIES in features/onboarding/schema.ts.
// We deliberately prefer short symbols (e.g. "Rs" for LKR) over Intl's
// locale code so amounts read as "$1,000.00" / "Rs 1,000.00", never "LKR 1,000.00".
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF",
  CNY: "¥",
  HKD: "HK$",
  NZD: "NZ$",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  SGD: "S$",
  INR: "₹",
  BRL: "R$",
  MXN: "Mex$",
  ZAR: "R",
  LKR: "Rs",
  MYR: "RM",
};

/** Returns the display symbol for a currency code, falling back to the code itself. */
export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

// Alphabetic symbols (Rs, CHF, kr, RM) read better with a separating space;
// glyph symbols ($, €, ₹, A$) sit flush against the number.
function symbolPrefix(currency: string): string {
  const symbol = currencySymbol(currency);
  return /[A-Za-z]$/.test(symbol) ? `${symbol} ` : symbol;
}

/**
 * Adds thousand separators to a raw, user-entered amount string while
 * preserving the decimal portion the user may still be typing (e.g. "1234.5"
 * → "1,234.5", "1000." → "1,000."). Returns "" for empty input.
 */
export function groupAmountString(raw: string): string {
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const hasDot = unsigned.includes(".");
  const [intPart, ...rest] = unsigned.split(".");
  const decPart = rest.join("");
  const groupedInt = intPart
    ? new Intl.NumberFormat("en-US").format(BigInt(intPart))
    : "";
  let out = groupedInt;
  if (hasDot) out += "." + decPart;
  return negative ? "-" + out : out;
}

export function formatMoney(
  minor: bigint | number,
  currency: string = "USD",
): string {
  const units = Number(minor) / 100;
  // Decimal style keeps thousand-separator grouping but drops Intl's currency
  // code, so we can prefix our own symbol uniformly across every currency.
  const grouped = new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(units);
  const prefix = symbolPrefix(currency);
  // Keep the sign in front of the symbol: -$1,000.00 rather than $-1,000.00.
  if (grouped.startsWith("-")) {
    return `-${prefix}${grouped.slice(1)}`;
  }
  return `${prefix}${grouped}`;
}
