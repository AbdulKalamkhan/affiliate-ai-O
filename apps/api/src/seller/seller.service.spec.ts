import { BadRequestException } from "@nestjs/common";

import { makeFakeDb } from "../test/fake-db";
import {
  UNKNOWN,
  applyInventoryAdjustment,
  buildListingDraft,
  calculateNetProfit,
  validateListing,
} from "./seller-domain";
import { SellerService } from "./seller.service";
import { MarketplaceRegistryService } from "./marketplace/marketplace-registry.service";
import { MarketplaceError, supports } from "./marketplace/marketplace-adapter";
import { AmazonSellerAdapter, MeeshoSupplierAdapter } from "./marketplace/marketplace-adapters";

describe("seller profit engine", () => {
  it("computes net profit only when every component is verified", () => {
    const result = calculateNetProfit({
      revenue: 1000,
      cogs: 400,
      fees: 150,
      shipping: 50,
      refunds: 0,
      otherCosts: 0,
    });
    expect(result.isComplete).toBe(true);
    expect(result.netProfit).toBe(400);
  });

  it("returns UNKNOWN profit when any cost component is missing", () => {
    const result = calculateNetProfit({
      revenue: 1000,
      cogs: 400,
      fees: UNKNOWN,
      shipping: 0,
      refunds: 0,
      otherCosts: 0,
    });
    expect(result.isComplete).toBe(false);
    expect(result.netProfit).toBeNull();
    expect(result.unknownComponents).toEqual(["fees"]);
    expect(result.reason).toContain("UNKNOWN");
  });

  it("never treats a missing cost as zero", () => {
    const result = calculateNetProfit({
      revenue: 500,
      cogs: UNKNOWN,
      fees: 0,
      shipping: UNKNOWN,
      refunds: 0,
      otherCosts: 0,
    });
    expect(result.netProfit).toBeNull();
    expect(result.unknownComponents).toEqual(["cogs", "shipping"]);
  });
});

describe("listing generation and validation", () => {
  it("keeps an unverified price UNKNOWN", () => {
    const draft = buildListingDraft({
      title: "Zor Jewellery Stainless Steel Anklet",
      description: "A durable stainless steel anklet for daily wear.",
      bullets: ["Skin friendly"],
    });
    expect(draft.price).toBe(UNKNOWN);
    expect(draft.validation.unknownFields).toContain("price");
  });

  it("rejects restricted marketing claims", () => {
    const validation = validateListing({
      title: "Best seller anklet guaranteed cure for arthritis",
      description: "Great product.",
      bullets: ["Best seller"],
      price: 999,
    });
    expect(validation.valid).toBe(false);
    expect(validation.violations.some((v) => v.code === "RESTRICTED_WORD")).toBe(true);
  });

  it("requires description and bullets", () => {
    const validation = validateListing({ title: "Valid title length here", price: 100 });
    expect(validation.valid).toBe(false);
    expect(validation.violations.map((v) => v.code)).toEqual(
      expect.arrayContaining(["DESCRIPTION_REQUIRED", "BULLETS_REQUIRED"]),
    );
  });

  it("passes a complete compliant listing", () => {
    const validation = validateListing({
      title: "Zor Jewellery Stainless Steel Anklet",
      description: "A durable stainless steel anklet for daily wear.",
      bullets: ["Skin friendly", "1.2 grams"],
      price: 999,
    });
    expect(validation.valid).toBe(true);
    expect(validation.unknownFields).toHaveLength(0);
  });
});

describe("inventory invariants", () => {
  it("rejects an adjustment that would make stock negative", () => {
    const result = applyInventoryAdjustment({ available: 2, reserved: 0, sold: 0 }, { available: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.snapshot.available).toBe(2);
      expect(result.reason).toContain("insufficient");
    }
  });

  it("applies a valid deduction", () => {
    const result = applyInventoryAdjustment({ available: 10, reserved: 0, sold: 0 }, { available: -3, sold: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot).toEqual({ available: 7, reserved: 0, sold: 3 });
    }
  });

  it("rejects negative reserved or sold", () => {
    const result = applyInventoryAdjustment({ available: 5, reserved: 1, sold: 1 }, { reserved: -2 });
    expect(result.ok).toBe(false);
  });
});

describe("SellerService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let service: SellerService;
  let sellerId: string;

  beforeEach(async () => {
    db = makeFakeDb();
    service = new SellerService(db.db);
    const seller = await service.createSeller({ platform: "AMAZON_SELLER", displayName: "Zor Jewellery" });
    sellerId = seller.id as string;
  });

  it("creates a seller account as not connected", async () => {
    expect(db.rows.sellerAccount[0].connected).toBe(false);
    expect(db.rows.sellerAccount[0].status).toBe("inactive");
  });

  it("requires a product title", async () => {
    await expect(service.createProduct({ title: "  " })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("generates a listing draft with a version and never publishes it", async () => {
    const result = await service.createListingDraft({
      sellerId,
      platform: "AMAZON_SELLER",
      title: "Zor Jewellery Stainless Steel Anklet",
      description: "A durable stainless steel anklet for daily wear.",
      bullets: ["Skin friendly"],
      price: 999,
    });
    expect(result.published).toBe(false);
    expect(result.version).toBe(1);
    expect(result.draft.validation.valid).toBe(true);
    expect(db.rows.sellerListingVersion).toHaveLength(1);
  });

  it("keeps an invalid listing in draft with recorded violations", async () => {
    const result = await service.createListingDraft({
      sellerId,
      platform: "AMAZON_SELLER",
      title: "short",
    });
    expect(result.listing.status).toBe("draft");
    expect(result.draft.validation.violations.length).toBeGreaterThan(0);
  });

  it("rejects an unknown listing status", async () => {
    const listing = await service.createListingDraft({
      sellerId,
      platform: "AMAZON_SELLER",
      title: "Zor Jewellery Stainless Steel Anklet",
      description: "A durable stainless steel anklet for daily wear.",
      bullets: ["Skin friendly"],
      price: 10,
    });
    await expect(service.updateListingStatus(listing.listing.id as string, "viral")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuses to oversell inventory and reports the unchanged snapshot", async () => {
    await service.adjustInventory({ sellerId, sku: "ANK-1", available: 5, reason: "initial stock" });
    const result = await service.adjustInventory({
      sellerId,
      sku: "ANK-1",
      available: -10,
      reason: "order fulfilment",
    });
    expect(result.applied).toBe(false);
    expect(db.rows.sellerInventory[0].availableQty).toBe(5);
  });

  it("requires a reason for every stock movement", async () => {
    await expect(service.adjustInventory({ sellerId, sku: "ANK-1", available: 1, reason: "" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("ingests an order idempotently per platform external id", async () => {
    const first = await service.ingestOrder({
      sellerId,
      platform: "AMAZON_SELLER",
      externalId: "AMZ-1",
      totalAmount: 999,
      items: [{ title: "Anklet", quantity: 1, unitPrice: 999 }],
    });
    expect(first.created).toBe(true);
    const second = await service.ingestOrder({
      sellerId,
      platform: "AMAZON_SELLER",
      externalId: "AMZ-1",
      totalAmount: 999,
    });
    expect(second.created).toBe(false);
    expect(db.rows.sellerOrder).toHaveLength(1);
  });

  it("rejects an order without a verified total", async () => {
    await expect(
      service.ingestOrder({ sellerId, platform: "AMAZON_SELLER", externalId: "X", totalAmount: NaN }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a non-positive order item quantity", async () => {
    await expect(
      service.ingestOrder({
        sellerId,
        platform: "AMAZON_SELLER",
        externalId: "AMZ-2",
        totalAmount: 100,
        items: [{ title: "x", quantity: 0, unitPrice: 100 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("derives settlement profit only when all components are known", async () => {
    const complete = await service.recordSettlement({
      sellerId,
      platform: "AMAZON_SELLER",
      totalAmount: 1000,
      fees: 150,
      refunds: 0,
      cogs: 400,
      shipping: 50,
      otherCosts: 0,
    });
    expect(complete.profit.netProfit).toBe(400);

    const partial = await service.recordSettlement({
      sellerId,
      platform: "AMAZON_SELLER",
      totalAmount: 800,
      fees: 100,
    });
    expect(partial.profit.netProfit).toBeNull();
    expect(partial.note).toContain("UNKNOWN");
  });

  it("stores an UNKNOWN settlement as NULL, never as a false zero (money truthfulness)", async () => {
    const { settlement, profit } = await service.recordSettlement({
      sellerId,
      platform: "AMAZON_SELLER",
      totalAmount: 800,
      fees: 100,
    });
    expect(profit.netProfit).toBeNull();
    // A missing platform cost is UNKNOWN, so it must never be persisted as 0.
    expect(settlement.netAmount ?? null).toBeNull();
    expect(settlement.refunds ?? null).toBeNull();
    expect(settlement.profitState).toBe("unknown");

    const complete = await service.recordSettlement({
      sellerId,
      platform: "AMAZON_SELLER",
      totalAmount: 1000,
      fees: 150,
      refunds: 0,
      cogs: 400,
      shipping: 50,
      otherCosts: 0,
    });
    expect(complete.settlement.netAmount).toBe(400);
    expect(complete.settlement.profitState).toBe("complete");
    // A verified zero stays a real zero, it is not confused with UNKNOWN.
    expect(complete.settlement.refunds).toBe(0);
  });

  it("audits every settlement and order money write", async () => {
    await service.ingestOrder({
      sellerId,
      platform: "AMAZON_SELLER",
      externalId: "AMZ-9",
      totalAmount: 500,
      items: [{ title: "Anklet", quantity: 1, unitPrice: 500 }],
      actor: "owner",
    });
    const settlement = await service.recordSettlement({
      sellerId,
      platform: "AMAZON_SELLER",
      totalAmount: 500,
      fees: 50,
      refunds: 0,
      cogs: 100,
      shipping: 0,
      otherCosts: 0,
      actor: "owner",
    });

    const orderAudit = db.rows.bossAuditLog.find(
      (r) => r.entityType === "seller_order" && r.entityId === db.rows.sellerOrder[0].id,
    );
    expect(orderAudit?.verb).toBe("money_write");
    expect(orderAudit?.actor).toBe("owner");
    const settlementAudit = db.rows.bossAuditLog.find(
      (r) => r.entityType === "seller_settlement" && r.entityId === settlement.settlement.id,
    );
    expect(settlementAudit?.verb).toBe("money_write");
    expect((settlementAudit?.detail as { netAmount: number }).netAmount).toBe(350);
  });

  it("order ingestion is atomic: a rejected line item never leaves a half-written order", async () => {
    await expect(
      service.ingestOrder({
        sellerId,
        platform: "AMAZON_SELLER",
        externalId: "AMZ-ATOMIC",
        totalAmount: 100,
        items: [
          { title: "good", quantity: 1, unitPrice: 50 },
          { title: "bad", quantity: 0, unitPrice: 50 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.rows.sellerOrder).toHaveLength(0);
    expect(db.rows.sellerOrderItem).toHaveLength(0);
    expect(db.rows.bossAuditLog.filter((r) => r.verb === "money_write")).toHaveLength(0);
  });

  it("upserts permissions without duplicating rows", async () => {
    await service.setPermissions(sellerId, [{ permission: "listings:write", granted: true }]);
    await service.setPermissions(sellerId, [{ permission: "listings:write", granted: false }]);
    expect(db.rows.sellerPermission).toHaveLength(1);
    expect(db.rows.sellerPermission[0].granted).toBe(false);
  });

  it("reports an honest overview with no data", async () => {
    const overview = await service.overview();
    expect(overview.sellers).toBe(1);
    expect(overview.connectedMarketplaces).toBe(0);
    expect(overview.status).toContain("no marketplace connected");
  });
});

describe("marketplace adapters", () => {
  it("never claims a live connection: credentials present is still not connected", async () => {
    const registry = new MarketplaceRegistryService();
    const status = await registry.status();
    expect(status).toHaveLength(3);
    for (const entry of status) {
      expect(entry.implementation).toBe("implemented");
      // No live transport exists, so `connected` is false for every provider
      // regardless of whether credential env var NAMES happen to be present.
      expect(entry.connected).toBe(false);
      expect(entry.state).toBe("ready_for_connection");
      expect(entry.ownerAction).not.toBeNull();
    }
  });

  it("reports credentials-present and not-connected separately", async () => {
    const name = "SELLER_ENGINE_TEST_FAKE_CREDENTIAL";
    process.env[name] = "set-but-not-a-real-connection";
    try {
      const registry = new MarketplaceRegistryService();
      const [status] = await registry.status();
      expect(status.credentialsPresent).toBe(false);
      expect(status.connected).toBe(false);
      expect(status.ownerAction).toContain("set");
    } finally {
      delete process.env[name];
    }
  });

  it("fails loudly instead of returning fake data when not connected", async () => {
    const adapter = new AmazonSellerAdapter();
    await expect(adapter.getOrders()).rejects.toBeInstanceOf(MarketplaceError);
    await expect(adapter.getOrders()).rejects.toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("reports UNSUPPORTED_CAPABILITY before touching the provider", async () => {
    const registry = new MarketplaceRegistryService();
    await expect(
      registry.execute("MEESHO_SUPPLIER", "getSettlements", (a) => a.getSettlements()),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
  });

  it("declares only real capabilities per provider", () => {
    expect(supports(new AmazonSellerAdapter(), "getSettlements")).toBe(true);
    expect(supports(new MeeshoSupplierAdapter(), "getSettlements")).toBe(false);
  });

  it("exposes capability discovery for all three platforms", () => {
    const registry = new MarketplaceRegistryService();
    expect(registry.all().map((a) => a.marketplace).sort()).toEqual([
      "AMAZON_SELLER",
      "FLIPKART_SELLER",
      "MEESHO_SUPPLIER",
    ]);
  });
});
