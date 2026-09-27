import { Inject, Injectable } from "@nestjs/common";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { MarketplaceRegistryService } from "../seller/marketplace/marketplace-registry.service";
import {
  notAvailable,
  notConnected,
  unknown,
  type MetricValue,
  type Provenance,
  type TimeWindow,
} from "./analytics.types";
import { isAllTime, resolveWindow, dateRange, type WindowRequest } from "./time-window";

const toNum = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object" && value !== null && "toNumber" in (value as { toNumber?: unknown })) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
};

const prov = (source: string, filter: Provenance["filter"], sampleSize: number): Provenance[] => [
  { source, filter, sampleSize },
];

/**
 * Unified analytics engine.
 *
 * Aggregates affiliate, campaign and seller evidence into one response, and —
 * more importantly — attaches the evidence state to every number so the UI
 * never has to guess whether a blank means "zero" or "nothing recorded".
 *
 * It NEVER invents a metric. Impressions/reach are `not_available` because no
 * social API is integrated; seller money is `not_connected` when no marketplace
 * is live. Both are honest answers, and both are different from 0.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient,
    @Inject(MarketplaceRegistryService) private readonly marketplaces?: MarketplaceRegistryService,
  ) {}

  async overview(request: WindowRequest = {}, now: Date = new Date()) {
    const window = resolveWindow(request, now);
    const [affiliate, campaign, seller] = await Promise.all([
      this.affiliateMetrics(window),
      this.campaignMetrics(window),
      this.sellerMetrics(window),
    ]);
    return {
      at: now.toISOString(),
      window,
      evidenceNote:
        "Every value is either a real measurement (evidenceState=known) or an explicit non-measurement. " +
        "A null value never means zero.",
      affiliate,
      campaign,
      seller,
    };
  }

  // ------------------------------------------------------------- affiliate

  private async affiliateMetrics(window: TimeWindow): Promise<Record<string, MetricValue>> {
    const clicksFilter = dateRange(window, "occurredAt");
    const revenueFilter = { ...dateRange(window, "occurredAt"), status: "reconciled" };

    const [clicks, reconciledAgg, reconciledCount, pendingEvents, profitRecords] = await Promise.all([
      this.client.affiliateLinkClick.count(clicksFilter ? { where: clicksFilter } : undefined),
      this.client.revenueEvent.aggregate({ _sum: { value: true }, where: revenueFilter }),
      this.client.revenueEvent.count({ where: revenueFilter }),
      this.client.revenueEvent.count({
        where: { ...(clicksFilter ?? {}), status: { not: "reconciled" } },
      }),
      this.client.profitRecord.findMany({
        where: { ...dateRange(window, "recordedAt") },
        select: { netProfit: true, grossAmount: true },
      }),
    ]);

    // `SUM` over zero rows is NULL in SQL and in Prisma. That null is the
    // signal that no commission evidence exists — it must never become 0.
    const revenueSum = reconciledAgg._sum.value;
    const hasRevenueEvidence = reconciledCount > 0;
    const profitSum = profitRecords.length
      ? profitRecords.reduce((acc, p) => acc + toNum(p.netProfit), 0)
      : null;

    // A conversion rate needs BOTH terms measured. With no clicks there is no
    // denominator; with no reconciled event there is no numerator. Deriving a
    // rate from either gap would manufacture a number.
    const conversionRate: MetricValue =
      clicks > 0 && hasRevenueEvidence
        ? {
            value: Math.round((reconciledCount / clicks) * 10_000) / 100,
            evidenceState: "known",
            provenance: [
              ...prov("affiliate_link_clicks", { ...(clicksFilter ?? {}) }, clicks),
              ...prov("revenue_events", { status: "reconciled" }, reconciledCount),
            ],
            note: `${reconciledCount} reconciled event(s) over ${clicks} click(s)`,
          }
        : unknown(
            clicks === 0
              ? "no clicks recorded in this window, so no conversion rate exists"
              : hasRevenueEvidence
                ? "no clicks recorded in this window, so no conversion rate exists"
                : "no reconciled revenue events in this window, so no conversion rate exists",
            [],
          );

    return {
      clicks: {
        value: clicks,
        evidenceState: "known",
        provenance: prov("affiliate_link_clicks", { ...(clicksFilter ?? {}) }, clicks),
        note: "Counted rows. 0 here is a measured zero: the click tracker is live and recorded nothing.",
      },
      conversions: {
        value: hasRevenueEvidence ? reconciledCount : null,
        evidenceState: hasRevenueEvidence ? "known" : "unknown",
        provenance: prov("revenue_events", { status: "reconciled", ...(clicksFilter ?? {}) }, reconciledCount),
        note: hasRevenueEvidence
          ? "Only status=reconciled events count. Pending/rejected are not conversions yet."
          : `No reconciled event in this window. ${pendingEvents} pending/rejected event(s) are excluded, not counted as zero revenue.`,
      },
      commission: revenueSum === null
        ? unknown("no reconciled commission evidence in this window", prov("revenue_events", { status: "reconciled" }, 0))
        : {
            value: toNum(revenueSum),
            evidenceState: "known",
            provenance: prov("revenue_events", { status: "reconciled", ...(clicksFilter ?? {}) }, reconciledCount),
          },
      revenue: revenueSum === null
        ? unknown("no reconciled commission evidence in this window", prov("revenue_events", { status: "reconciled" }, 0))
        : {
            value: toNum(revenueSum),
            evidenceState: "known",
            provenance: prov("revenue_events", { status: "reconciled", ...(clicksFilter ?? {}) }, reconciledCount),
          },
      profit: profitSum === null
        ? unknown("no profit record in this window", prov("profit_records", {}, 0))
        : {
            value: Math.round(profitSum * 100) / 100,
            evidenceState: "known",
            provenance: prov("profit_records", {}, profitRecords.length),
            note: "gross − fee − cost from recorded profit records",
          },
      conversionRate,
      impressions: notAvailable(
        "impressions and reach require a social platform API (Pinterest/Instagram) that is not connected. Not estimated.",
      ),
    };
  }

  // -------------------------------------------------------------- campaign

  private async campaignMetrics(window: TimeWindow): Promise<Record<string, MetricValue>> {
    const allTime = isAllTime(window);
    const assetWhere = allTime ? undefined : dateRange(window, "createdAt");
    const publishWhere = allTime ? undefined : dateRange(window, "publishedAt");

    const [assets, published, reconciledAgg, reconciledCount] = await Promise.all([
      this.client.contentAsset.count(assetWhere ? { where: assetWhere } : undefined),
      this.client.contentAsset.count({ where: { published: true, ...publishWhere } }),
      this.client.revenueEvent.aggregate({
        _sum: { value: true },
        where: { status: "reconciled", ...dateRange(window, "occurredAt") },
      }),
      this.client.revenueEvent.count({
        where: { status: "reconciled", ...dateRange(window, "occurredAt") },
      }),
    ]);

    // Campaign revenue is the same reconciled total the overview reports, so the
    // two can never disagree. `SUM` over no rows is NULL and stays UNKNOWN.
    const revenueSum = reconciledAgg._sum.value;

    return {
      assets: {
        value: assets,
        evidenceState: "known",
        provenance: prov("content_assets", { ...(assetWhere ?? {}) }, assets),
      },
      published: {
        value: published,
        evidenceState: "known",
        provenance: prov("content_assets", { published: true, ...(publishWhere ?? {}) }, published),
        note: "Set by the Owner when a pin actually goes live. Not inferred from creation.",
      },
      // Campaign money is attributed through the tracked link and only from
      // reconciled evidence. Per-campaign split is in /analytics/campaigns.
      revenue: revenueSum === null
        ? unknown(
            "no reconciled commission event in this window",
            prov("revenue_events", { status: "reconciled", ...dateRange(window, "occurredAt") }, 0),
          )
        : {
            value: toNum(revenueSum),
            evidenceState: "known",
            provenance: prov(
              "revenue_events",
              { status: "reconciled", ...dateRange(window, "occurredAt") },
              reconciledCount,
            ),
            note: "total reconciled commission in this window; the per-campaign split is in /analytics/campaigns",
          },
    };
  }

  // ----------------------------------------------------------------- seller

  private async sellerMetrics(window: TimeWindow): Promise<Record<string, MetricValue>> {
    const range = dateRange(window, "createdAt");
    const [settlements, orders, live] = await Promise.all([
      this.client.sellerSettlement.findMany({
        where: { ...range },
        select: {
          id: true,
          totalAmount: true,
          fees: true,
          refunds: true,
          netAmount: true,
          profitState: true,
          currency: true,
        },
      }),
      this.client.sellerOrder.count({ where: { ...range } }),
      this.marketplaces ? this.marketplaces.status() : Promise.resolve([]),
    ]);

    // A recorded settlement IS evidence. What is missing without a live
    // transport is the CONTINUOUS feed, not the data already in hand — so the
    // two must be reported separately. Blanketing every seller metric as
    // NOT_CONNECTED would throw away real recorded money and hide it behind an
    // excuse; equally, reporting a count as "synced" would overstate coverage.
    const anyLive = live.some((m) => m.connected);
    const sync = anyLive
      ? {
          value: null,
          evidenceState: "known" as const,
          provenance: prov("marketplace_connections", {}, live.length),
          note: "at least one marketplace has a verified live connection",
        }
      : notConnected(
          "no marketplace has a verified live connection; figures below are only what was recorded manually and may be incomplete",
        );

    // Fees/refunds are nullable per settlement because a platform that does not
    // state a component leaves it UNKNOWN. A total is only real when EVERY
    // settlement stated it.
    const allStated = (field: "fees" | "refunds" | "netAmount"): boolean =>
      settlements.length > 0 && settlements.every((s) => s[field] !== null && s[field] !== undefined);
    const totalOf = (field: "totalAmount" | "fees" | "refunds" | "netAmount"): number =>
      settlements.reduce((acc, s) => acc + toNum(s[field]), 0);

    const gmv = settlements.length ? totalOf("totalAmount") : null;
    const fees = allStated("fees") ? totalOf("fees") : null;
    const refunds = allStated("refunds") ? totalOf("refunds") : null;
    const profit = allStated("netAmount") ? totalOf("netAmount") : null;

    const money = (
      value: number | null,
      source: string,
      field: "totalAmount" | "fees" | "refunds" | "netAmount",
    ): MetricValue =>
      value === null
        ? unknown(
            settlements.length
              ? `at least one settlement in this window left ${field} unstated; the total would be a guess`
              : "no settlement evidence in this window",
            prov(source, { ...(range ?? {}) }, settlements.length),
          )
        : {
            value: Math.round(value * 100) / 100,
            evidenceState: "known",
            provenance: prov(source, { ...(range ?? {}) }, settlements.length),
            note: anyLive
              ? "sum of recorded settlements in this window"
              : "sum of manually recorded settlements; no live transport is verified so this may be incomplete",
          };

    return {
      orders: orders > 0
        ? {
            value: orders,
            evidenceState: "known",
            provenance: prov("seller_orders", { ...(range ?? {}) }, orders),
            note: anyLive
              ? "counted orders synced from a marketplace"
              : "orders recorded locally; no live transport is verified so this may be incomplete",
          }
        : {
            value: 0,
            evidenceState: anyLive ? ("known" as const) : ("not_connected" as const),
            provenance: prov("seller_orders", { ...(range ?? {}) }, 0),
            note: anyLive
              ? "counted rows: a live transport recorded no order in this window"
              : "no order recorded, and no live transport is verified to prove that is the true state",
          },
      gmv: money(gmv, "seller_settlements", "totalAmount"),
      fees: money(fees, "seller_settlements", "fees"),
      refunds: money(refunds, "seller_settlements", "refunds"),
      settlements: settlements.length > 0
        ? {
            value: settlements.length,
            evidenceState: "known",
            provenance: prov("seller_settlements", { ...(range ?? {}) }, settlements.length),
          }
        : {
            value: 0,
            evidenceState: anyLive ? ("known" as const) : ("not_connected" as const),
            provenance: prov("seller_settlements", { ...(range ?? {}) }, 0),
            note: anyLive
              ? "counted rows: a live transport recorded no settlement in this window"
              : "no settlement recorded, and no live transport is verified to prove that is the true state",
          },
      cogs: unknown(
        "cost of goods sold is asserted per settlement by the caller; it is not derived from a live catalogue",
        prov("seller_settlements", { ...(range ?? {}) }, settlements.length),
      ),
      profit: money(profit, "seller_settlements", "netAmount"),
      // The honest availability signal, kept apart from the recorded figures.
      liveSync: sync,
    };
  }

  // ------------------------------------------------------------ by channel

  /**
   * Channel attribution from recorded clicks, plus the money attributable to
   * each channel through the link a reconciled event points at.
   */
  async channels(request: WindowRequest = {}, now: Date = new Date()) {
    const window = resolveWindow(request, now);
    const range = dateRange(window, "occurredAt");
    const links = await this.client.affiliateLink.findMany({
      select: { id: true, channel: true, provider: true },
    });

    // Clicks must be counted INSIDE the window. The relation `_count` is
    // all-time, so using it here would report every click ever recorded under
    // a "7d" heading and silently break the one guarantee a chart owes the
    // reader: that its number matches its title. `where` is omitted entirely
    // for allTime, which must count EVERY click rather than none.
    const clickCounts = await this.client.affiliateLinkClick.groupBy({
      by: ["linkId"],
      where: range,
      _count: { _all: true },
    });
    const clicksByLink = new Map(clickCounts.map((c) => [String(c.linkId), c._count._all] as const));

    const events = await this.client.revenueEvent.findMany({
      where: { status: "reconciled", ...(range ?? {}) },
      select: { linkId: true, value: true },
    });

    const byChannel = new Map<string, { clicks: number; commission: number | null; providers: Set<string> }>();
    for (const link of links) {
      const key = String(link.channel);
      const entry = byChannel.get(key) ?? { clicks: 0, commission: null, providers: new Set<string>() };
      entry.clicks += clicksByLink.get(link.id) ?? 0;
      entry.providers.add(link.provider);
      byChannel.set(key, entry);
    }

    const linksById = new Map(links.map((l) => [l.id, String(l.channel)] as const));
    const commissionByChannel = new Map<string, number>();
    for (const event of events) {
      if (!event.linkId) continue;
      const channel = linksById.get(event.linkId);
      if (!channel) continue;
      commissionByChannel.set(channel, (commissionByChannel.get(channel) ?? 0) + toNum(event.value));
    }

    return {
      at: now.toISOString(),
      window,
      channels: [...byChannel.entries()]
        .map(([channel, entry]) => ({
          channel,
          providers: [...entry.providers].sort(),
          clicks: {
            value: entry.clicks,
            evidenceState: "known" as const,
            provenance: prov("affiliate_link_clicks", { channel, ...(range ?? {}) }, entry.clicks),
          },
          commission: {
            value: commissionByChannel.get(channel) ?? null,
            evidenceState: commissionByChannel.has(channel) ? ("known" as const) : ("unknown" as const),
            provenance: prov("revenue_events", { status: "reconciled", channel }, commissionByChannel.get(channel) ?? 0),
            note: commissionByChannel.has(channel)
              ? "reconciled events attributed through the tracked link"
              : "no reconciled event attributed to this channel in this window",
          },
        }))
        .sort((a, b) => b.clicks.value - a.clicks.value),
    };
  }

  /** Per-campaign breakdown, every number evidence-tagged. */
  async campaigns(request: WindowRequest = {}, now: Date = new Date()) {
    const window = resolveWindow(request, now);
    const range = dateRange(window, "occurredAt");
    const links = await this.client.affiliateLink.findMany({
      select: { id: true, offer: true, provider: true, channel: true },
    });
    const events = await this.client.revenueEvent.findMany({
      where: { status: "reconciled", ...(range ?? {}) },
      select: { linkId: true, value: true },
    });
    // Window-scoped click counts, not the all-time relation `_count`. An
    // allTime window omits the filter so every click is counted; treating the
    // missing range as "no clicks" would report a false zero.
    const clickCounts = await this.client.affiliateLinkClick.groupBy({
      by: ["linkId"],
      where: range,
      _count: { _all: true },
    });
    const clicks = new Map(clickCounts.map((c) => [String(c.linkId), c._count._all] as const));

    const commission = new Map<string, number>();
    for (const e of events) {
      if (!e.linkId) continue;
      commission.set(e.linkId, (commission.get(e.linkId) ?? 0) + toNum(e.value));
    }

    const rows = links.map((link) => {
      const hasCommission = commission.has(link.id);
      const clickCount = clicks.get(link.id) ?? 0;
      return {
        linkId: link.id,
        campaign: link.offer ?? "uncategorized",
        provider: link.provider,
        channel: link.channel,
        clicks: {
          value: clickCount,
          evidenceState: "known" as const,
          provenance: prov("affiliate_link_clicks", { linkId: link.id, ...(range ?? {}) }, clickCount),
        },
        commission: {
          value: hasCommission ? (commission.get(link.id) as number) : null,
          evidenceState: hasCommission ? ("known" as const) : ("unknown" as const),
          provenance: prov(
            "revenue_events",
            { linkId: link.id, status: "reconciled", ...(range ?? {}) },
            hasCommission ? 1 : 0,
          ),
          note: hasCommission ? undefined : "no reconciled commission recorded for this campaign yet",
        },
      };
    });

    return {
      at: now.toISOString(),
      window,
      campaigns: rows,
      note:
        "Commission is attributed only from reconciled events linked to a tracked link. " +
        "A campaign with clicks and no commission reports UNKNOWN, not ₹0.",
    };
  }
}
