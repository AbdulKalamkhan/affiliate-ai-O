import { BadRequestException } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import "reflect-metadata";

import { makeFakeDb } from "../test/fake-db";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsModule } from "./analytics.module";
import { AnalyticsService } from "./analytics.service";
import { SellerModule } from "../seller/seller.module";
import { MarketplaceRegistryService } from "../seller/marketplace/marketplace-registry.service";
import { resolveWindow, dateRange, DEFAULT_TIMEZONE } from "./time-window";
import { sumKnown, TIME_WINDOW_KEYS } from "./analytics.types";

// A fixed instant so window maths is deterministic: 2026-09-27T10:30Z.
const NOW = new Date("2026-09-27T10:30:00.000Z");

describe("time windows", () => {
  it("defaults to 30d in IST and echoes the timezone", () => {
    const w = resolveWindow({}, NOW);
    expect(w.key).toBe("30d");
    expect(w.timezone).toBe(DEFAULT_TIMEZONE);
    expect(w.from).not.toBeNull();
    expect(w.to).not.toBeNull();
  });

  it("computes 'today' as local midnight, not UTC midnight", () => {
    // 2026-09-27T10:30Z is 16:00 IST on the 27th, so IST "today" starts at
    // 2026-09-26T18:30:00Z. A UTC implementation would report 00:00Z and would
    // misattribute six hours of revenue to the wrong day.
    const w = resolveWindow({ window: "today" }, NOW);
    expect(w.from).toBe("2026-09-26T18:30:00.000Z");
    expect(w.to).toBe("2026-09-27T18:30:00.000Z");
  });

  it("shifts 'today' with the timezone rather than assuming UTC", () => {
    const ist = resolveWindow({ window: "today" }, NOW);
    const ny = resolveWindow({ window: "today", timezone: "America/New_York" }, NOW);
    // 16:00 IST is 06:30 in New York, a different local day boundary.
    expect(ny.from).not.toBe(ist.from);
    expect(ny.timezone).toBe("America/New_York");
  });

  it("covers exactly N days for rolling windows", () => {
    const w = resolveWindow({ window: "7d" }, NOW);
    const from = new Date(w.from as string).getTime();
    const to = new Date(w.to as string).getTime();
    expect(Math.round((to - from) / 86_400_000)).toBe(7);
  });

  it("applies both bounds of a range to the query", () => {
    const range = dateRange(resolveWindow({ window: "7d" }, NOW), "occurredAt") as unknown as {
      occurredAt: { gte: Date; lt: Date };
    };
    // A range that only checked one bound would leak rows from any other
    // period into the window and quietly inflate every chart.
    expect(range.occurredAt.gte).toBeInstanceOf(Date);
    expect(range.occurredAt.lt).toBeInstanceOf(Date);
    expect(range.occurredAt.gte.getTime()).toBeLessThan(range.occurredAt.lt.getTime());
  });

  it("uses half-open [from, to) so adjacent windows never double count", () => {
    const today = resolveWindow({ window: "today" }, NOW);
    const range = dateRange(today, "occurredAt") as unknown as {
      occurredAt: { gte: Date; lt: Date };
    };
    // A record exactly at `to` must be EXCLUDED, so the next window owns it.
    expect(range.occurredAt.lt.getTime()).toBe(new Date("2026-09-27T18:30:00.000Z").getTime());
    expect(range.occurredAt.gte.getTime()).toBe(new Date("2026-09-26T18:30:00.000Z").getTime());
  });

  it("returns no date restriction for allTime", () => {
    const w = resolveWindow({ window: "allTime" }, NOW);
    expect(w.from).toBeNull();
    expect(w.to).toBeNull();
    expect(dateRange(w, "occurredAt")).toBeUndefined();
  });

  it("rejects an unknown window, timezone and malformed custom range", () => {
    expect(() => resolveWindow({ window: "13d" }, NOW)).toThrow(BadRequestException);
    expect(() => resolveWindow({ timezone: "Mars/Olympus" }, NOW)).toThrow(BadRequestException);
    expect(() => resolveWindow({ window: "custom" }, NOW)).toThrow(BadRequestException);
    expect(() =>
      resolveWindow({ window: "custom", from: "2026-09-27T00:00:00Z", to: "2026-09-26T00:00:00Z" }, NOW),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveWindow({ window: "custom", from: "not-a-date", to: "2026-09-27T00:00:00Z" }, NOW),
    ).toThrow(BadRequestException);
  });

  it("accepts a valid custom window and preserves the exact instants", () => {
    const w = resolveWindow(
      { window: "custom", from: "2026-09-01T00:00:00.000Z", to: "2026-09-15T00:00:00.000Z" },
      NOW,
    );
    expect(w.key).toBe("custom");
    expect(w.from).toBe("2026-09-01T00:00:00.000Z");
    expect(w.to).toBe("2026-09-15T00:00:00.000Z");
  });
});

describe("sumKnown", () => {
  it("refuses to total a partial breakdown", () => {
    expect(sumKnown([{ value: 100, evidenceState: "known", provenance: [] }])).toBe(100);
    // One UNKNOWN component makes the whole total UNKNOWN, not "smaller".
    expect(
      sumKnown([
        { value: 100, evidenceState: "known", provenance: [] },
        { value: null, evidenceState: "unknown", provenance: [] },
      ]),
    ).toBeNull();
    expect(sumKnown([])).toBeNull();
  });
});

describe("AnalyticsService evidence discipline", () => {
  const seedLink = (db: ReturnType<typeof makeFakeDb>["db"]) =>
    db.affiliateLink.create({
      data: {
        provider: "amazon-associates",
        channel: "PINTEREST",
        offer: "ASIN-B08BG1HC7R",
        destination: "https://www.amazon.in/dp/B08BG1HC7R?tag=zorajewellery-21",
      },
    });

  it("reports clicks as a measured zero and revenue as UNKNOWN on an empty system", async () => {
    const { db } = makeFakeDb();
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);

    // A COUNT of rows we queried: 0 here is real.
    expect(result.affiliate.clicks.value).toBe(0);
    expect(result.affiliate.clicks.evidenceState).toBe("known");

    // Money with no evidence must be null, never 0.
    expect(result.affiliate.revenue.value).toBeNull();
    expect(result.affiliate.revenue.evidenceState).toBe("unknown");
    expect(result.affiliate.profit.value).toBeNull();
    expect(result.affiliate.profit.evidenceState).toBe("unknown");
    expect(result.affiliate.commission.value).toBeNull();
  });

  it("never reports an impressions number it cannot source", async () => {
    const { db } = makeFakeDb();
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.affiliate.impressions.value).toBeNull();
    expect(result.affiliate.impressions.evidenceState).toBe("not_available");
    expect(result.affiliate.impressions.note).toMatch(/not estimated/i);
  });

  it("reports seller money as NOT_CONNECTED on an empty system with no live link", async () => {
    const { db } = makeFakeDb();
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    // No live transport: a zero would be an unproven claim about the real world.
    expect(result.seller.gmv.value).toBeNull();
    expect(result.seller.gmv.evidenceState).toBe("unknown");
    expect(result.seller.liveSync.evidenceState).toBe("not_connected");
    expect(result.seller.liveSync.note).toMatch(/manually/i);
  });

  it("still reports manually recorded settlement money instead of discarding it", async () => {
    const { db } = makeFakeDb();
    const seller = await db.sellerAccount.create({
      data: { platform: "AMAZON_SELLER", displayName: "Zora Jewellery" },
    });
    await db.sellerSettlement.create({
      data: {
        sellerId: seller.id,
        platform: "AMAZON_SELLER",
        totalAmount: 1000,
        fees: 100,
        refunds: 0,
        netAmount: 900,
        profitState: "complete",
      },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    // A refund of 0 here is a VERIFIED zero, not missing evidence.
    expect(result.seller.refunds.value).toBe(0);
    expect(result.seller.refunds.evidenceState).toBe("known");
    expect(result.seller.gmv.value).toBe(1000);
    expect(result.seller.fees.value).toBe(100);
    expect(result.seller.profit.value).toBe(900);
    expect(result.seller.settlements.value).toBe(1);
    // Recorded figures are known, yet coverage is still honestly not_connected.
    expect(result.seller.liveSync.evidenceState).toBe("not_connected");
    expect(result.seller.gmv.note).toMatch(/manually recorded/i);
  });

  it("refuses a seller total when one settlement leaves a cost unstated", async () => {
    const { db } = makeFakeDb();
    const seller = await db.sellerAccount.create({
      data: { platform: "AMAZON_SELLER", displayName: "Zora Jewellery" },
    });
    await db.sellerSettlement.create({
      data: { sellerId: seller.id, platform: "AMAZON_SELLER", totalAmount: 1000, fees: 100, refunds: 0 },
    });
    // Second settlement omits `netAmount`, so profit cannot be totalled.
    await db.sellerSettlement.create({
      data: { sellerId: seller.id, platform: "AMAZON_SELLER", totalAmount: 500, fees: 50, refunds: 0 },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.seller.gmv.value).toBe(1500);
    expect(result.seller.profit.value).toBeNull();
    expect(result.seller.profit.evidenceState).toBe("unknown");
    expect(result.seller.profit.note).toMatch(/would be a guess/);
  });

  it("counts recorded seller orders as orders, not settlements", async () => {
    const { db } = makeFakeDb();
    const seller = await db.sellerAccount.create({
      data: { platform: "AMAZON_SELLER", displayName: "Zora Jewellery" },
    });
    await db.sellerOrder.create({
      data: { sellerId: seller.id, externalId: "A-1", platform: "AMAZON_SELLER", totalAmount: 999 },
    });
    await db.sellerSettlement.create({
      data: { sellerId: seller.id, platform: "AMAZON_SELLER", totalAmount: 1000, fees: 10, refunds: 0, netAmount: 990 },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    // One order, one settlement: conflating them would report orders = 1 only
    // by luck here, so assert both numbers are independently sourced.
    expect(result.seller.orders.value).toBe(1);
    expect(result.seller.settlements.value).toBe(1);
    expect(result.seller.orders.provenance[0].source).toBe("seller_orders");
  });

  it("counts clicks but refuses to derive a conversion rate from them", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.affiliate.clicks.value).toBe(1);
    // A rate needs both terms; with no reconciled event there is no rate.
    expect(result.affiliate.conversionRate.value).toBeNull();
    expect(result.affiliate.conversionRate.evidenceState).toBe("unknown");
  });

  it("excludes pending events from revenue and explains why", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.revenueEvent.create({
      data: { value: 500, status: "pending", provider: "amazon-associates", linkId: link.id },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.affiliate.revenue.value).toBeNull();
    expect(result.affiliate.conversions.note).toMatch(/1 pending\/rejected/);
  });

  it("reports reconciled money as a real measurement with provenance", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.revenueEvent.create({
      data: { value: 750.5, status: "reconciled", provider: "amazon-associates", linkId: link.id },
    });
    await db.profitRecord.create({
      data: { source: "amazon", grossAmount: 750.5, feeAmount: 50, costAmount: 100, netProfit: 600.5 },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.affiliate.revenue.value).toBe(750.5);
    expect(result.affiliate.revenue.evidenceState).toBe("known");
    expect(result.affiliate.profit.value).toBe(600.5);
    expect(result.affiliate.revenue.provenance[0].source).toBe("revenue_events");
    expect(result.affiliate.revenue.provenance[0].sampleSize).toBe(1);
    expect(result.affiliate.conversions.value).toBe(1);
    // Campaign revenue is the SAME reconciled total the overview reports, so
    // the two views can never disagree.
    expect(result.campaign.revenue.value).toBe(750.5);
    expect(result.campaign.revenue.evidenceState).toBe("known");
    // Reconciled revenue with zero clicks: the numerator exists, the
    // denominator does not, so the rate stays UNKNOWN rather than 0.
    expect(result.affiliate.conversionRate.value).toBeNull();
    expect(result.affiliate.conversionRate.evidenceState).toBe("unknown");
  });

  it("reports campaign revenue as UNKNOWN when nothing is reconciled", async () => {
    const { db } = makeFakeDb();
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.campaign.revenue.value).toBeNull();
    expect(result.campaign.revenue.evidenceState).toBe("unknown");
    // Counts remain real measurements even when money is unknown.
    expect(result.campaign.assets.evidenceState).toBe("known");
    expect(result.campaign.published.evidenceState).toBe("known");
  });

  it("computes COGS from the durable cost lines", async () => {
    const { db } = makeFakeDb();
    const seller = await db.sellerAccount.create({
      data: { platform: "AMAZON_SELLER", displayName: "Zora Jewellery" },
    });
    const settlement = await db.sellerSettlement.create({
      data: {
        sellerId: seller.id,
        platform: "AMAZON_SELLER",
        externalId: "STL-COGS-1",
        totalAmount: 1000,
        fees: 100,
        refunds: 0,
        netAmount: 500,
        profitState: "complete",
      },
    });
    // The cost lines live on the CHILD table and are filtered through the
    // parent settlement, so this proves the relation filter really resolves.
    await db.sellerSettlementLine.create({
      data: { settlementId: settlement.id, kind: "cogs", amount: 400, source: "asserted_by_operator" },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.seller.cogs.value).toBe(400);
    expect(result.seller.cogs.evidenceState).toBe("known");
    expect(result.seller.cogs.provenance[0].source).toBe("seller_settlement_lines");
  });

  it("keeps COGS UNKNOWN when only some settlements stated a cost", async () => {
    const { db } = makeFakeDb();
    const seller = await db.sellerAccount.create({
      data: { platform: "AMAZON_SELLER", displayName: "Zora Jewellery" },
    });
    const withCost = await db.sellerSettlement.create({
      data: { sellerId: seller.id, platform: "AMAZON_SELLER", externalId: "STL-COGS-2A", totalAmount: 1000 },
    });
    await db.sellerSettlementLine.create({
      data: { settlementId: withCost.id, kind: "cogs", amount: 400 },
    });
    // A second settlement in the same window stated no COGS at all. Summing the
    // one known figure would understate cost and overstate profit.
    await db.sellerSettlement.create({
      data: { sellerId: seller.id, platform: "AMAZON_SELLER", externalId: "STL-COGS-2B", totalAmount: 2000 },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.seller.cogs.value).toBeNull();
    expect(result.seller.cogs.evidenceState).toBe("unknown");
    expect(result.seller.cogs.note).toMatch(/overstate profit/);
  });

  it("restricts COGS to the window via the settlement's own createdAt", async () => {
    const { db } = makeFakeDb();
    const seller = await db.sellerAccount.create({
      data: { platform: "AMAZON_SELLER", displayName: "Zora Jewellery" },
    });
    const inside = await db.sellerSettlement.create({
      data: { sellerId: seller.id, platform: "AMAZON_SELLER", externalId: "STL-COGS-3A", totalAmount: 1000 },
    });
    const outside = await db.sellerSettlement.create({
      data: {
        sellerId: seller.id,
        platform: "AMAZON_SELLER",
        externalId: "STL-COGS-3B",
        totalAmount: 2000,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await db.sellerSettlementLine.create({ data: { settlementId: inside.id, kind: "cogs", amount: 400 } });
    await db.sellerSettlementLine.create({ data: { settlementId: outside.id, kind: "cogs", amount: 900 } });
    const service = new AnalyticsService(db);
    const week = await service.overview({ window: "7d" }, NOW);
    const all = await service.overview({ window: "allTime" }, NOW);
    expect(week.seller.cogs.value).toBe(400);
    expect(all.seller.cogs.value).toBe(1300);
  });

  it("computes a real conversion rate when both terms are measured", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    for (let i = 0; i < 4; i += 1) {
      await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    }
    await db.revenueEvent.create({
      data: { value: 100, status: "reconciled", provider: "amazon-associates", linkId: link.id },
    });
    const result = await new AnalyticsService(db).overview({ window: "allTime" }, NOW);
    expect(result.affiliate.clicks.value).toBe(4);
    expect(result.affiliate.conversions.value).toBe(1);
    expect(result.affiliate.conversionRate.value).toBe(25);
  });

  it("attaches a window to every response so a chart cannot drift from its numbers", async () => {
    const { db } = makeFakeDb();
    const service = new AnalyticsService(db);
    for (const key of ["today", "7d", "30d", "90d", "allTime"] as const) {
      const result = await service.overview({ window: key }, NOW);
      expect(result.window.key).toBe(key);
      expect(result.window.timezone).toBe(DEFAULT_TIMEZONE);
    }
  });

  it("actually filters by window instead of ignoring the range", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    // One click inside the last 7 days, one well outside it.
    await db.affiliateLinkClick.create({
      data: { linkId: link.id, occurredAt: new Date("2026-09-25T00:00:00.000Z") },
    });
    await db.affiliateLinkClick.create({
      data: { linkId: link.id, occurredAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const service = new AnalyticsService(db);
    const week = await service.overview({ window: "7d" }, NOW);
    const all = await service.overview({ window: "allTime" }, NOW);
    expect(week.affiliate.clicks.value).toBe(1);
    expect(all.affiliate.clicks.value).toBe(2);
  });

  it("reports per-campaign commission as UNKNOWN, not zero, when none is reconciled", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    const result = await new AnalyticsService(db).campaigns({ window: "allTime" }, NOW);
    const row = result.campaigns.find((c) => c.linkId === link.id);
    expect(row?.campaign).toBe("ASIN-B08BG1HC7R");
    expect(row?.clicks.value).toBe(1);
    expect(row?.commission.value).toBeNull();
    expect(row?.commission.evidenceState).toBe("unknown");
  });

  it("attributes commission to a channel only from reconciled evidence", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    await db.revenueEvent.create({
      data: { value: 300, status: "reconciled", provider: "amazon-associates", linkId: link.id },
    });
    const result = await new AnalyticsService(db).channels({ window: "allTime" }, NOW);
    const pinterest = result.channels.find((c) => c.channel === "PINTEREST");
    expect(pinterest?.clicks.value).toBe(1);
    expect(pinterest?.commission.value).toBe(300);
    expect(pinterest?.commission.evidenceState).toBe("known");
  });

  it("marks a channel with clicks but no commission as UNKNOWN", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.affiliateLinkClick.create({ data: { linkId: link.id } });
    const result = await new AnalyticsService(db).channels({ window: "allTime" }, NOW);
    const pinterest = result.channels.find((c) => c.channel === "PINTEREST");
    expect(pinterest?.commission.value).toBeNull();
    expect(pinterest?.commission.evidenceState).toBe("unknown");
  });

  it("restricts channel clicks to the window instead of counting all time", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.affiliateLinkClick.create({
      data: { linkId: link.id, occurredAt: new Date("2026-09-25T00:00:00.000Z") },
    });
    await db.affiliateLinkClick.create({
      data: { linkId: link.id, occurredAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const service = new AnalyticsService(db);
    const week = await service.channels({ window: "7d" }, NOW);
    const all = await service.channels({ window: "allTime" }, NOW);
    expect(week.channels.find((c) => c.channel === "PINTEREST")?.clicks.value).toBe(1);
    expect(all.channels.find((c) => c.channel === "PINTEREST")?.clicks.value).toBe(2);
  });

  it("restricts campaign clicks to the window instead of counting all time", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await db.affiliateLinkClick.create({
      data: { linkId: link.id, occurredAt: new Date("2026-09-25T00:00:00.000Z") },
    });
    await db.affiliateLinkClick.create({
      data: { linkId: link.id, occurredAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const service = new AnalyticsService(db);
    const week = await service.campaigns({ window: "7d" }, NOW);
    const all = await service.campaigns({ window: "allTime" }, NOW);
    expect(week.campaigns.find((c) => c.linkId === link.id)?.clicks.value).toBe(1);
    expect(all.campaigns.find((c) => c.linkId === link.id)?.clicks.value).toBe(2);
  });

  it("keeps a click at the exact window boundary out of the window", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const w = resolveWindow({ window: "today" }, NOW);
    // Exactly at `to`: owned by the next window, must not be counted here.
    await db.affiliateLinkClick.create({ data: { linkId: link.id, occurredAt: new Date(w.to as string) } });
    await db.affiliateLinkClick.create({
      data: { linkId: link.id, occurredAt: new Date(w.from as string) },
    });
    const result = await new AnalyticsService(db).overview({ window: "today" }, NOW);
    // `from` is inclusive, `to` is exclusive: exactly one click counted.
    expect(result.affiliate.clicks.value).toBe(1);
  });
});

describe("analytics module wiring", () => {
  it("imports SellerModule so the optional registry injection can resolve", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AnalyticsModule) as unknown[];
    expect(imports).toContain(SellerModule);
  });

  it("guards the runtime dependency: SellerModule must export the registry", () => {
    // AnalyticsService injects MarketplaceRegistryService optionally. If
    // SellerModule stops exporting it, the provider silently becomes undefined
    // in production and every seller metric quietly flips to not_connected.
    const exportsList = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SellerModule) as unknown[];
    expect(exportsList).toContain(MarketplaceRegistryService);
  });
});

describe("AnalyticsController", () => {
  const controller = (stub: Partial<AnalyticsService>) =>
    new AnalyticsController(stub as AnalyticsService);

  it("passes window, range and timezone through to the service", () => {
    const overview = jest.fn();
    const c = controller({ overview });
    c.overview("7d", "2026-09-01T00:00:00.000Z", "2026-09-15T00:00:00.000Z", "America/New_York");
    expect(overview).toHaveBeenCalledWith({
      window: "7d",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-15T00:00:00.000Z",
      timezone: "America/New_York",
    });
  });

  it("publishes a machine-readable contract with no null for the states", () => {
    const meta = controller({}).meta() as unknown as {
      windows: readonly string[];
      defaultWindow: string;
      defaultTimezone: string;
      evidenceStates: string[];
      boundaryConvention: string;
    };
    expect(meta.windows).toEqual(TIME_WINDOW_KEYS);
    expect(meta.defaultTimezone).toBe(DEFAULT_TIMEZONE);
    // The UI reads these instead of hardcoding, so every state must be named.
    for (const state of ["known", "unknown", "not_configured", "not_connected", "not_verified", "not_available"]) {
      expect(meta.evidenceStates).toContain(state);
    }
    expect(meta.boundaryConvention).toContain("[from, to)");
  });
});