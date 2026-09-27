import { DashboardService } from "./dashboard.service";
import { RevenueService } from "../revenue/revenue.service";
import { makeFakeDb } from "../test/fake-db";

const makeService = (db: ReturnType<typeof makeFakeDb>["db"]) =>
  new DashboardService(db, new RevenueService(db));

const seedLink = async (
  db: ReturnType<typeof makeFakeDb>["db"],
  overrides: { channel?: "PINTEREST"; createdAt?: Date } = {},
) =>
  db.affiliateLink.create({
    data: {
      provider: "amazon-associates",
      destination: "https://www.amazon.in/dp/B08N5WRWNW?tag=zorajewellery-21",
      channel: overrides.channel ?? "PINTEREST",
      createdAt: overrides.createdAt ?? new Date("2026-09-01T00:00:00.000Z"),
    },
  });

describe("DashboardService", () => {
  it("reports real zero COUNTS but UNKNOWN money totals on an empty database", async () => {
    const { db } = makeFakeDb();
    const result = await makeService(db).overview();
    // Counts are a measurement of rows we just counted, so 0 is a real zero.
    expect(result.counts).toEqual({
      opportunities: 0,
      affiliateLinks: 0,
      contentAssets: 0,
      publishedAssets: 0,
      clicks: 0,
      conversions: 0,
      profitRecords: 0,
    });
    // Money is different: nothing has been reconciled, so the total is UNKNOWN.
    // Rendering ₹0.00 here would claim the business earned exactly nothing,
    // which is a measurement we do not have. This assertion previously encoded
    // the bug by expecting 0.
    expect(result.totals.revenue).toBeNull();
    expect(result.totals.profit).toBeNull();
    expect(result.clicksByChannel).toEqual({});
    expect(result.recentLinks).toHaveLength(0);
    expect(result.recentAssets).toHaveLength(0);
    expect(result.recentRevenueEvents).toHaveLength(0);
    expect(new Date(result.at).toISOString()).toBe(result.at);
  });

  it("reports a genuine 0 money total when recorded rows really do sum to zero", async () => {
    const { db } = makeFakeDb();
    // A recorded, reconciled event of 0 IS a measurement, and must render as 0
    // rather than being confused with "no data".
    await db.revenueEvent.create({ data: { value: 0, status: "reconciled", provider: "amazon-associates" } });
    await db.profitRecord.create({ data: { source: "test", grossAmount: 0, feeAmount: 0, costAmount: 0, netProfit: 0 } });

    const result = await makeService(db).overview();
    expect(result.counts.conversions).toBe(1);
    expect(result.counts.profitRecords).toBe(1);
    expect(result.totals.revenue).toBe(0);
    expect(result.totals.profit).toBe(0);
  });

  it("counts records across all tracked entities", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.opportunity.create({ data: { name: "op", category: "x", notes: "y" } });
    await db.contentAsset.create({
      data: { title: "draft", description: "d", linkId: link.id, published: false },
    });
    await db.contentAsset.create({
      data: { title: "live", description: "d", linkId: link.id, published: true },
    });
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    await db.revenueEvent.create({ data: { value: 100, status: "reconciled", provider: "amazon-associates" } });
    await db.profitRecord.create({
      data: { source: "test", grossAmount: 100, feeAmount: 10, costAmount: 50, netProfit: 40 },
    });

    const result = await makeService(db).overview();
    expect(result.counts).toEqual({
      opportunities: 1,
      affiliateLinks: 1,
      contentAssets: 2,
      publishedAssets: 1,
      clicks: 2,
      conversions: 1,
      profitRecords: 1,
    });
    expect(result.totals.revenue).toBe(100);
    expect(result.totals.profit).toBe(40);
    expect(result.clicksByChannel).toEqual({ PINTEREST: 2 });
  });

  it("keeps money totals UNKNOWN when there are clicks but no reconciled revenue", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });

    const result = await makeService(db).overview();
    expect(result.counts.clicks).toBe(2);
    expect(result.counts.conversions).toBe(0);
    // Clicks exist, but we have NO reconciled revenue/profit evidence: the
    // totals must remain UNKNOWN (null) rather than coerced to a false 0.
    expect(result.totals.revenue).toBeNull();
    expect(result.totals.profit).toBeNull();
  });

  it("aggregates clicks by channel using the embedded _count", async () => {
    const { db } = makeFakeDb();
    const a = await seedLink(db, { channel: "PINTEREST" });
    const b = await seedLink(db, { channel: "PINTEREST" });
    await db.affiliateLinkClick.create({ data: { linkId: a.id } });
    await db.affiliateLinkClick.create({ data: { linkId: a.id } });
    await db.affiliateLinkClick.create({ data: { linkId: b.id } });

    const result = await makeService(db).overview();
    expect(result.clicksByChannel).toEqual({ PINTEREST: 3 });
    expect(result.counts.clicks).toBe(3);
  });

  it("sums revenue only from reconciled events and all profit records", async () => {
    const { db } = makeFakeDb();
    await db.revenueEvent.create({ data: { value: 50, status: "reconciled", provider: "amazon-associates" } });
    await db.revenueEvent.create({ data: { value: 25, status: "reconciled", provider: "amazon-associates" } });
    await db.revenueEvent.create({ data: { value: 999, status: "pending", provider: "amazon-associates" } });
    await db.revenueEvent.create({ data: { value: 999, status: "rejected", provider: "amazon-associates" } });
    await db.profitRecord.create({
      data: { source: "test", grossAmount: 50, feeAmount: 5, costAmount: 34.5, netProfit: 10.5 },
    });
    await db.profitRecord.create({
      data: { source: "test", grossAmount: 20, feeAmount: 2, costAmount: 13.5, netProfit: 4.5 },
    });

    const result = await makeService(db).overview();
    expect(result.totals.revenue).toBe(75);
    expect(result.totals.profit).toBe(15);
    // Verified conversions only count reconciled events, NOT pending or rejected.
    expect(result.counts.conversions).toBe(2);
  });

  it("does not count pending or rejected revenue events as conversions", async () => {
    const { db } = makeFakeDb();
    await db.revenueEvent.create({ data: { value: 10, status: "pending", provider: "amazon-associates" } });
    await db.revenueEvent.create({ data: { value: 20, status: "rejected", provider: "amazon-associates" } });
    await db.revenueEvent.create({ data: { value: 30, status: "reconciled", provider: "amazon-associates" } });

    const result = await makeService(db).overview();
    expect(result.counts.conversions).toBe(1);
    expect(result.totals.revenue).toBe(30);
  });

  it("returns the newest 5 records with click counts embedded on links and assets", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db, { createdAt: new Date("2026-09-05T00:00:00.000Z") });
    await seedLink(db, { channel: "PINTEREST", createdAt: new Date("2026-09-04T00:00:00.000Z") });
    await seedLink(db, { channel: "PINTEREST", createdAt: new Date("2026-09-03T00:00:00.000Z") });
    await seedLink(db, { channel: "PINTEREST", createdAt: new Date("2026-09-02T00:00:00.000Z") });
    await seedLink(db, { channel: "PINTEREST", createdAt: new Date("2026-09-01T00:00:00.000Z") });
    await seedLink(db, { channel: "PINTEREST", createdAt: new Date("2026-08-31T00:00:00.000Z") });
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    await db.contentAsset.create({
      data: { title: "live", description: "d", linkId: link.id, published: true },
    });
    await db.revenueEvent.create({
      data: {
        value: 10,
        status: "reconciled",
        provider: "amazon-associates",
        occurredAt: new Date("2026-09-06T00:00:00.000Z"),
      },
    });

    const result = await makeService(db).overview();
    expect(result.recentLinks).toHaveLength(5);
    expect(result.recentLinks[0]._count.clicks).toBe(1);
    expect(result.recentLinks.map((l) => new Date(l.createdAt).toISOString())).toEqual([
      "2026-09-05T00:00:00.000Z",
      "2026-09-04T00:00:00.000Z",
      "2026-09-03T00:00:00.000Z",
      "2026-09-02T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    ]);
    expect(result.recentAssets).toHaveLength(1);
    expect(result.recentAssets[0].link._count.clicks).toBe(1);
    expect(result.recentRevenueEvents).toHaveLength(1);
    expect(result.recentRevenueEvents[0]).toMatchObject({
      value: 10,
      status: "reconciled",
      provider: "amazon-associates",
    });
  });

  it("embeds the revenue-concentration KPI: reconciled-only, share %, and risk alert over the threshold", async () => {
    const { db } = makeFakeDb();
    await db.revenueEvent.create({ data: { value: 95, status: "reconciled", provider: "amazon-associates", currency: "INR" } });
    await db.revenueEvent.create({ data: { value: 5, status: "reconciled", provider: "second-network", currency: "INR" } });
    // pending/rejected must not inflate the KPI
    await db.revenueEvent.create({ data: { value: 999, status: "pending", provider: "amazon-associates", currency: "INR" } });
    await db.revenueEvent.create({ data: { value: 999, status: "rejected", provider: "amazon-associates", currency: "INR" } });

    const result = await makeService(db).overview();
    expect(result.concentration.totalRevenue).toBe(100);
    expect(result.concentration.providerCount).toBe(2);
    expect(result.concentration.concentrationThresholdPct).toBe(90);
    expect(result.concentration.riskAlerts.map((p) => p.provider)).toEqual(["amazon-associates"]);
    const amazon = result.concentration.providers.find((p) => p.provider === "amazon-associates")!;
    expect(amazon.riskAlert).toBe(true);
    expect(amazon.sharePct).toBe(95);
    expect(result.concentration.providers.find((p) => p.provider === "second-network")!.sharePct).toBe(5);
  });
});