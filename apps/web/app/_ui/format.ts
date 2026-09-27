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

/**
 * Label shown whenever a metric has NO verified evidence behind it.
 *
 * This exists because `value ?? 0` is a lie: it renders "we know the answer is
 * zero" for a system that has never received the evidence. A dashboard that
 * shows ₹0 before any conversion data exists is indistinguishable from one
 * reporting a real, measured zero, and the second reading is a business
 * decision. UNKNOWN must therefore look different from zero, everywhere.
 */
export const UNKNOWN_LABEL = "Awaiting data";

/** Money: a real zero formats as ₹0.00; no evidence stays explicitly UNKNOWN. */
export function moneyOrUnknown(n: number | null | undefined, unknownLabel = UNKNOWN_LABEL): string {
  return n == null ? unknownLabel : formatInr(n);
}

/** Counts: same rule, so 0 and UNKNOWN are never visually identical. */
export function countOrUnknown(n: number | null | undefined, unknownLabel = UNKNOWN_LABEL): string {
  return n == null ? unknownLabel : n.toLocaleString("en-IN");
}

export function conversionRateText(
  clicks: number | null | undefined,
  conversions: number | null | undefined,
  digits = 2,
): string {
  const rate = conversionRate(clicks, conversions);
  return rate != null ? rateText(rate, digits) : "Awaiting data";
}