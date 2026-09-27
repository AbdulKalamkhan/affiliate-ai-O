// Time-window resolution with explicit, auditable timezone behaviour.
//
// WHY NOT `new Date(); date.setDate(date - 7)`?
//
// Because "last 7 days" is not a UTC concept. A money dashboard that slices
// days in UTC will attribute a commission earned at 02:30 IST to the previous
// day, and the Owner will never be able to reproduce the number. The timezone is
// therefore an explicit input that is echoed back in every response.
//
// Boundaries are half-open: [from, to). A click at exactly `to` belongs to the
// next window. This makes adjacent windows provably non-overlapping and their
// sums provably equal to the all-time total.

import { BadRequestException } from "@nestjs/common";

import { TIME_WINDOW_KEYS, type TimeWindow, type TimeWindowKey } from "./analytics.types";

/** Default reporting timezone. The business books in IST; UTC is the fallback. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export interface WindowRequest {
  window?: string;
  /** ISO-8601 inclusive start, only meaningful with `window=custom`. */
  from?: string;
  /** ISO-8601 exclusive end, only meaningful with `window=custom`. */
  to?: string;
  /** IANA timezone name. */
  timezone?: string;
}

/** Offset in minutes for an IANA zone at a given instant (via Intl). */
const zoneOffsetMinutes = (instant: Date, timeZone: string): number => {
  // `en-US` with a numeric timeZoneName gives a GMT offset that Intl has
  // already resolved for this instant, so DST is handled for free.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
};

/** Midnight local to `timeZone` on the calendar day containing `instant`. */
const startOfLocalDay = (instant: Date, timeZone: string): Date => {
  const offset = zoneOffsetMinutes(instant, timeZone);
  // Shift so the UTC rendering of the local wall clock is readable.
  const local = new Date(instant.getTime() + offset * 60_000);
  const midnightUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return new Date(midnightUtc - offset * 60_000);
};

const addDays = (instant: Date, days: number): Date => new Date(instant.getTime() + days * 86_400_000);

const isValidZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const LABELS: Record<Exclude<TimeWindowKey, "custom">, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  allTime: "All time",
};

/**
 * Resolve a window request into concrete [from, to) boundaries.
 *
 * `now` is injectable so the boundaries are deterministic and testable rather
 * than depending on the wall clock at call time.
 */
export const resolveWindow = (request: WindowRequest = {}, now: Date = new Date()): TimeWindow => {
  const timeZone = request.timezone ?? DEFAULT_TIMEZONE;
  if (!isValidZone(timeZone)) {
    // An unknown timezone silently falling back to UTC would misattribute money
    // across a day boundary, so this is a client error, not a default.
    throw new BadRequestException(`unknown timezone "${timeZone}"`);
  }

  const key = (request.window ?? "30d") as TimeWindowKey;
  if (!(TIME_WINDOW_KEYS as readonly string[]).includes(key)) {
    throw new BadRequestException(`window must be one of: ${TIME_WINDOW_KEYS.join(", ")}`);
  }

  if (key === "custom") {
    if (!request.from || !request.to) {
      throw new BadRequestException("window=custom requires both from and to (ISO-8601)");
    }
    const from = new Date(request.from);
    const to = new Date(request.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("from and to must be valid ISO-8601 timestamps");
    }
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException("custom window requires from < to (boundaries are [from, to))");
    }
    return {
      key: "custom",
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: timeZone,
      label: `${from.toISOString()} → ${to.toISOString()}`,
    };
  }

  if (key === "allTime") {
    // No boundary at all. This is NOT the same as "since the epoch": it means
    // "everything the system has recorded", so a metric with no rows is
    // genuinely UNKNOWN rather than "summed over an empty range".
    return { key, from: null, to: null, timezone: timeZone, label: LABELS.allTime };
  }

  const todayStart = startOfLocalDay(now, timeZone);
  const from =
    key === "today" ? todayStart : addDays(todayStart, -({ "7d": 7, "30d": 30, "90d": 90 }[key] as number) + 1);
  return {
    key,
    from: from.toISOString(),
    to: addDays(todayStart, 1).toISOString(),
    timezone: timeZone,
    label: LABELS[key],
  };
};

/**
 * Build a Prisma `where` fragment for a date column, or `undefined` for an
 * all-time window (no restriction at all).
 *
 * Keyed by the column name so the result drops straight into a typed Prisma
 * `where` object and the compiler still checks the field exists on the model.
 */
export const dateRange = <F extends string>(
  window: TimeWindow,
  field: F,
): Record<F, { gte?: Date; lt?: Date }> | undefined => {
  const clause: { gte?: Date; lt?: Date } = {};
  if (window.from) clause.gte = new Date(window.from);
  if (window.to) clause.lt = new Date(window.to);
  if (Object.keys(clause).length === 0) return undefined;
  return { [field]: clause } as Record<F, { gte?: Date; lt?: Date }>;
};

/** True when the window places no restriction on time. */
export const isAllTime = (window: TimeWindow): boolean => window.from === null && window.to === null;
