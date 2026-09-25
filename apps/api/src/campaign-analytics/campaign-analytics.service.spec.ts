import { CampaignAnalyticsService } from "./campaign-analytics.service";
import { makeFakeDb } from "../test/fake-db";

describe("CampaignAnalyticsService", () => {
  it("returns empty campaigns and zero totals on an empty database", async () => {
    const { db } = makeFakeDb();
    const service = new CampaignAnalyticsService(db);
    const result = await service.overview();
    expect(result.campaigns).toEqual([]);
    expect(result.totals).toEqual({ clicks: 0, conversions: 0, revenue: 0, profit: 0 });
  });

  it("groups recorded evidence per campaign and excludes pending/rejected events", async () => {
    const { db, rows } = makeFakeDb();
    const service = new CampaignAnalyticsService(db);

    const ankletLink = await db.affiliateLink.create({
      data: { provider: "amazon-associates", campaign: "anklet-c3", channel: "PINTEREST", destination: "https://a.in/1" },
    });
    const toeLink = await db.affiliateLink.create({
      data: { provider: "amazon-associates", campaign: "toe-rings", destination: "https://a.in/2" },
    });
    const untagged = await db.affiliateLink.create({
      data: { provider: "amazon-associates", destination: "https://a.in/3" },
    });

    await db.affiliateLinkClick.create({ data: { linkId: ankletLink.id } });
    await db.affiliateLinkClick.create({ data: { linkId: ankletLink.id } });
    await db.affiliateLinkClick.create({ data: { linkId: toeLink.id } });
    await db.affiliateLinkClick.create({ data: { linkId: untagged.id } });

    const ankletEvent = await db.revenueEvent.create({
      data: { provider: "amazon-associates", sourceId: "AN-1", value: 100, status: "reconciled", linkId: ankletLink.id },
    });
    await db.profitRecord.create({
      data: { revenueEventId: ankletEvent.id, source: "amazon:AN-1", grossAmount: 100, feeAmount: 20, costAmount: 40, netProfit: 40 },
    });
    const toeEvent = await db.revenueEvent.create({
      data: { provider: "amazon-associates", sourceId: "TO-1", value: 50, status: "reconciled", linkId: toeLink.id },
    });
    await db.profitRecord.create({
      data: { revenueEventId: toeEvent.id, source: "amazon:TO-1", grossAmount: 50, feeAmount: 10, costAmount: 20, netProfit: 20 },
    });

    // Pending + rejected events must never become conversions/revenue.
    await db.revenueEvent.create({
      data: { provider: "amazon-associates", sourceId: "AN-2", value: 999, status: "pending", linkId: ankletLink.id },
    });
    await db.revenueEvent.create({
      data: { provider: "amazon-associates", sourceId: "AN-3", value: 888, status: "rejected", linkId: ankletLink.id },
    });

    const result = await service.overview();
    const byCampaign = Object.fromEntries(result.campaigns.map((c) => [c.campaign, c]));
    const anklet = byCampaign["anklet-c3"]!;
    expect(anklet.linkCount).toBe(1);
    expect(anklet.clicks).toBe(2);
    expect(anklet.conversions).toBe(1);
    expect(anklet.revenue).toBe(100);
    expect(anklet.profit).toBe(40);
    expect(anklet.providerCount).toBe(1);
    expect(anklet.channels).toEqual(["PINTEREST"]);

    const toe = byCampaign["toe-rings"]!;
    expect(toe.linkCount).toBe(1);
    expect(toe.clicks).toBe(1);
    expect(toe.conversions).toBe(1);
    expect(toe.revenue).toBe(50);
    expect(toe.profit).toBe(20);

    // Untagged links + their clicks land in an explicit uncategorized bucket.
    const uncategorized = byCampaign["(uncategorized)"]!;
    expect(uncategorized.linkCount).toBe(1);
    expect(uncategorized.clicks).toBe(1);
    expect(uncategorized.conversions).toBe(0);
    expect(uncategorized.revenue).toBe(0);
    expect(uncategorized.profit).toBe(0);

    // Totals reconcile exactly; pending/rejected never counted.
    expect(result.totals).toEqual({ clicks: 4, conversions: 2, revenue: 150, profit: 60 });

    // Sort order: highest revenue first.
    expect(result.campaigns.map((c) => c.campaign)).toEqual(["anklet-c3", "toe-rings", "(uncategorized)"]);

    // Money-watch sanity: recorded evidence must be unchanged by a read-only overview.
    expect(rows["revenueEvent"]).toHaveLength(4);
    expect(rows["profitRecord"]).toHaveLength(2);
  });

  it("attributes a standalone profit record (no event) to the uncategorized bucket so totals stay truthful", async () => {
    const { db } = makeFakeDb();
    const service = new CampaignAnalyticsService(db);
    await db.profitRecord.create({
      data: { source: "manual", grossAmount: 30, feeAmount: 0, costAmount: 5, netProfit: 25 },
    });

    const result = await service.overview();
    const uncategorized = result.campaigns.find((c) => c.campaign === "(uncategorized)")!;
    expect(uncategorized.profit).toBe(25);
    expect(uncategorized.conversions).toBe(0);
    expect(result.totals.profit).toBe(25);
  });
});