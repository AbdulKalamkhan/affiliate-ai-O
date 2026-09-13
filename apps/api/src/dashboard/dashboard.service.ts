import { Injectable } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object" && "toNumber" in (value as { toNumber?: unknown })) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

const LINKS_META = {
  include: {
    _count: { select: { clicks: true } },
  },
} as const;

@Injectable()
export class DashboardService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  async overview() {
    const [counts, links, aggregates] = await Promise.all([
      Promise.all([
        this.client.opportunity.count(),
        this.client.affiliateLink.count(),
        this.client.contentAsset.count(),
        this.client.contentAsset.count({ where: { published: true } }),
        this.client.affiliateLinkClick.count(),
        this.client.revenueEvent.count(),
        this.client.profitRecord.count(),
      ]),
      this.client.affiliateLink.findMany({
        select: {
          channel: true,
          _count: { select: { clicks: true } },
        },
      }),
      Promise.all([
        // Verified money only: pending/rejected events are not revenue yet.
        this.client.revenueEvent.aggregate({
          _sum: { value: true },
          where: { status: "reconciled" },
        }),
        this.client.profitRecord.aggregate({ _sum: { netProfit: true } }),
      ]),
    ]);

    const [
      opportunities,
      affiliateLinks,
      contentAssets,
      publishedAssets,
      clicks,
      conversions,
      profitRecords,
    ] = counts;

    const clicksByChannel: Record<string, number> = {};
    for (const link of links) {
      const key = link.channel as string;
      clicksByChannel[key] = (clicksByChannel[key] ?? 0) + link._count.clicks;
    }

    const [revenueAgg, profitAgg] = aggregates;

    const [recentLinks, recentAssets, recentRevenueEvents] = await Promise.all([
      this.client.affiliateLink.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        ...LINKS_META,
      }),
      this.client.contentAsset.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { link: { include: { _count: { select: { clicks: true } } } } },
      }),
      this.client.revenueEvent.findMany({ orderBy: { occurredAt: "desc" }, take: 5 }),
    ]);

    return {
      at: new Date().toISOString(),
      counts: {
        opportunities,
        affiliateLinks,
        contentAssets,
        publishedAssets,
        clicks,
        conversions,
        profitRecords,
      },
      totals: {
        revenue: toNumber(revenueAgg._sum.value),
        profit: toNumber(profitAgg._sum.netProfit),
      },
      clicksByChannel,
      recentLinks,
      recentAssets,
      recentRevenueEvents: recentRevenueEvents.map((e) => ({
        id: e.id,
        provider: e.provider,
        sourceId: e.sourceId,
        eventType: e.eventType,
        value: toNumber(e.value),
        currency: e.currency,
        status: e.status,
        linkId: e.linkId,
        occurredAt: e.occurredAt,
      })),
    };
  }
}