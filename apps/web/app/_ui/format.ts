export function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatInrCompact(n: number | null | undefined): string {
  return n == null ? "—" : `₹${n.toLocaleString("en-IN")}`;
}

export function conversionRate(
  clicks: number | null | undefined,
  conversions: number | null | undefined,
): number | null {
  return clicks != null && clicks > 0 && conversions != null ? (conversions / clicks) * 100 : null;
}

export function rateText(rate: number, digits = 2): string {
  return `${rate.toFixed(digits)}%`;
}

export function conversionRateText(
  clicks: number | null | undefined,
  conversions: number | null | undefined,
  digits = 2,
): string {
  const rate = conversionRate(clicks, conversions);
  return rate != null ? rateText(rate, digits) : "Awaiting data";
}