import { Controller, Get, Query } from "@nestjs/common";

import { AnalyticsService } from "./analytics.service";
import { TIME_WINDOW_KEYS } from "./analytics.types";
import { DEFAULT_TIMEZONE } from "./time-window";

/**
 * Analytics read surface.
 *
 * Every endpoint takes the same three query parameters so a chart and its
 * numbers can never be computed over different windows:
 *   ?window=7d|30d|90d|today|allTime|custom
 *   &from=&to=   (custom only)
 *   &timezone=   (IANA, default Asia/Kolkata)
 */
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get("overview")
  overview(
    @Query("window") window?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("timezone") timezone?: string,
  ) {
    return this.service.overview({ window, from, to, timezone });
  }

  @Get("channels")
  channels(
    @Query("window") window?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("timezone") timezone?: string,
  ) {
    return this.service.channels({ window, from, to, timezone });
  }

  @Get("campaigns")
  campaigns(
    @Query("window") window?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("timezone") timezone?: string,
  ) {
    return this.service.campaigns({ window, from, to, timezone });
  }

  /** Machine-readable contract, so the UI never hardcodes a window or a state. */
  @Get("meta")
  meta() {
    return {
      windows: TIME_WINDOW_KEYS,
      defaultWindow: "30d",
      defaultTimezone: DEFAULT_TIMEZONE,
      evidenceStates: [
        "known",
        "unknown",
        "not_configured",
        "not_connected",
        "not_verified",
        "not_available",
      ],
      boundaryConvention: "[from, to) — a record at exactly `to` belongs to the next window",
      note: "A null value with evidenceState=unknown means NO EVIDENCE, not zero.",
    };
  }
}
