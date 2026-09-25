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

const UNCATEGORIZED = "(uncategorized)";

interface CampaignBucket {
  campaign: string;
  providers: Set<string>;
  channels: Set<string>;
  linkCount: number;
  clicks: number;
  conversions: number;
  revenue: number;
  profit: number;
}

// Phase-06 campaign analytics slice: normalize affiliate outcomes into per-campaign
// metrics using ONLY recorded evidence (clicks on tagged links + reconciled revenue
// events + linked profit records). Reach/impressions need a social API — never
// inferred. Pending/rejected events never count as conversions. No fabrication.
@Injectable()
export class CampaignAnalyticsService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  async overview() {
    const [links, events, profits] = await Promise.all([
      this.client.affiliateLink.findMany({ include: { _count: { select: { clicks: true } } } }),
      this.client.revenueEvent.findMany({ where: { status: "reconciled" } }),
      this.client.profitRecord.findMany(),
    ]);

    const linkMeta = new Map<string, { campaign: string; provider: string; channel: string }>();
    for (const link of links) {
      linkMeta.set(link.id, {
        campaign: typeof link.campaign === "string" && link.campaign.trim() ? link.campaign.trim() : UNCATEGORIZED,
        provider: typeof link.provider === "string" ? link.provider : "",
        channel: typeof link.channel === "string" ? link.channel : "",
      });
    }

    const buckets = new Map<string, CampaignBucket>();
    const bucketFor = (label: string): CampaignBucket => {
      let bucket = buckets.get(label);
      if (!bucket) {
        bucket = {
          campaign: label,
          providers: new Set<string>(),
          channels: new Set<string>(),
          linkCount: 0,
          clicks: 0,
          conversions: 0,
          revenue: 0,
          profit: 0,
        };
        buckets.set(label, bucket);
      }
      return bucket;
    };

    // Seed buckets from links so click/link counts are truthful even without revenue.
    for (const link of links) {
      const meta = linkMeta.get(link.id)!;
      const bucket = bucketFor(meta.campaign);
      bucket.linkCount += 1;
      if (meta.provider) bucket.providers.add(meta.provider);
      if (meta.channel) bucket.channels.add(meta.channel);
      bucket.clicks += toNumber(link._count?.clicks);
    }

    // Conversions + revenue: verified (reconciled) events only, attributed via their link.
    const campaignByEvent = new Map<string, string>();
    for (const event of events) {
      const meta = event.linkId ? linkMeta.get(event.linkId as string) : undefined;
      const label = meta?.campaign ?? UNCATEGORIZED;
      campaignByEvent.set(event.id, label);
      const bucket = bucketFor(label);
      bucket.conversions += 1;
      bucket.revenue += toNumber(event.value);
    }

    // Profit: attribute every profit record through its verified event (or uncategorized).
    for (const profit of profits) {
      const eventId = typeof profit.revenueEventId === "string" ? profit.revenueEventId : null;
      const label = eventId ? campaignByEvent.get(eventId) ?? UNCATEGORIZED : UNCATEGORIZED;
      bucketFor(label).profit += toNumber(profit.netProfit);
    }

    const campaigns = [...buckets.values()]
      .map((b) => ({
        campaign: b.campaign,
        providerCount: b.providers.size,
        channels: [...b.channels].sort(),
        linkCount: b.linkCount,
        clicks: b.clicks,
        conversions: b.conversions,
        revenue: Math.round(b.revenue * 100) / 100,
        profit: Math.round(b.profit * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks);

    return {
      at: new Date().toISOString(),
      campaigns,
      totals: campaigns.reduce(
        (acc, c) => ({
          clicks: acc.clicks + c.clicks,
          conversions: acc.conversions + c.conversions,
          revenue: Math.round((acc.revenue + c.revenue) * 100) / 100,
          profit: Math.round((acc.profit + c.profit) * 100) / 100,
        }),
        { clicks: 0, conversions: 0, revenue: 0, profit: 0 },
      ),
    };
  }
}