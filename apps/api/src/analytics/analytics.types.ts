// Unified analytics: time windows, evidence states and provenance.
//
// DESIGN RULE
//
// An analytics number without provenance is a rumour. Every metric this engine
// returns carries WHERE it came from, HOW MUCH evidence backs it, and — when
// there is no evidence — an explicit state saying so. A dashboard that renders
// "0 clicks" and "no click data" identically has made both unreadable.
//
// The distinction that keeps getting lost elsewhere in this codebase:
//   value = 0   with evidenceState "known"      -> we measured zero
//   value = null with evidenceState "unknown"   -> we measured nothing
// Collapsing the second into the first is how a system ends up confidently
// reporting a business that never existed.

/**
 * Why a number is or is not available. These are deliberately distinct strings
 * because each one implies a DIFFERENT action for the Owner:
 *
 *  - `known`          we have evidence; the number is real
 *  - `unknown`        no evidence exists yet; do not render a number
 *  - `not_configured` the integration exists in code but has no credentials
 *  - `not_connected`  credentials exist but no live transport
 *  - `not_verified`   connected, but never proven against the live API
 *  - `not_available`  the source genuinely does not collect this metric
 *                     (e.g. impressions need a social API that is not integrated)
 */
export const EVIDENCE_STATES = [
  "known",
  "unknown",
  "not_configured",
  "not_connected",
  "not_verified",
  "not_available",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** Where a metric came from. Never contains a credential or a raw payload. */
export interface Provenance {
  /** Logical source name, e.g. "affiliate_link_clicks". */
  source: string;
  /** Row-level filter applied, so a number can be traced back to a query. */
  filter: Record<string, unknown>;
  /** How many rows back the number. 0 means "no rows", which is not evidence. */
  sampleSize: number;
}

export interface TimeWindow {
  /** Canonical key, or "custom". */
  key: TimeWindowKey;
  /** Inclusive start, or null for all-time. */
  from: string | null;
  /** Exclusive end, or null for all-time. */
  to: string | null;
  /**
   * IANA timezone the window boundaries were computed in. Explicit because
   * "today" is not a UTC concept and a money dashboard that silently used UTC
   * would misattribute a day's revenue near midnight.
   */
  timezone: string;
  /** Human-readable label for the UI. */
  label: string;
}

export const TIME_WINDOW_KEYS = ["today", "7d", "30d", "90d", "allTime", "custom"] as const;
export type TimeWindowKey = (typeof TIME_WINDOW_KEYS)[number];

/**
 * One metric with its honesty attached.
 *
 * `value` is `number | null`. `null` is the ONLY representation of "we do not
 * know", and it always travels with an evidence state that is not `known`.
 */
export interface MetricValue {
  value: number | null;
  evidenceState: EvidenceState;
  provenance: Provenance[];
  /**
   * Optional explanation rendered in the UI when the metric is not `known`, so
   * the Owner learns WHY instead of just seeing a blank.
   */
  note?: string;
}

export const unknown = (note: string, provenance: Provenance[] = []): MetricValue => ({
  value: null,
  evidenceState: "unknown",
  provenance,
  note,
});

export const notAvailable = (note: string, provenance: Provenance[] = []): MetricValue => ({
  value: null,
  evidenceState: "not_available",
  provenance,
  note,
});

export const notConnected = (note: string, provenance: Provenance[] = []): MetricValue => ({
  value: null,
  evidenceState: "not_connected",
  provenance,
  note,
});

/**
 * Sum a set of nullable money values.
 *
 * Returns `null` when ANY component is UNKNOWN, because a total built from a
 * partial breakdown is not a smaller number — it is a wrong number. This is the
 * same rule `calculateNetProfit` applies to seller settlements, applied here at
 * the aggregation layer.
 */
export const sumKnown = (parts: MetricValue[]): number | null => {
  if (parts.length === 0) return null;
  if (parts.some((p) => p.evidenceState !== "known" || p.value === null)) return null;
  return parts.reduce<number>((acc, p) => acc + (p.value as number), 0);
};
