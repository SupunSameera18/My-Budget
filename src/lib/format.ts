export function formatMoney(
  minor: bigint | number,
  currency: string = "USD",
): string {
  const units = Number(minor) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(units);
  } catch {
    return units.toFixed(2);
  }
}
