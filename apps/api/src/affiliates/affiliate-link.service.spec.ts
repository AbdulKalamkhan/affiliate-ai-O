import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AffiliateLinkService } from "./affiliate-link.service";
import { makeFakeDb } from "../test/fake-db";
import type { ProductDataFetchInput, ProductDataProvider } from "./product-data/product-data.provider";

const manualProvider = (): ProductDataProvider => ({ name: "manual", fetch: async () => ({}) });

describe("AffiliateLinkService", () => {
  it("creates a link with tagged destination and extracted ASIN (no PA-API)", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    const link = await service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW?th=1", campaign: "batch-1" });
    expect(link.destination).toContain("tag=zorajewellery-21");
    expect(link.destination).toContain("th=1");
    expect(link.offer).toBe("B08N5WRWNW");
    expect(link.provider).toBe("amazon-associates");
    expect(link.campaign).toBe("batch-1");
  });

  it("keeps manually entered product metadata (no auto-fetch at Phase-00)", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    const link = await service.createLink({
      url: "https://www.amazon.in/dp/B08N5WRWNW",
      title: "Gold Locket",
      imageUrl: "https://example.com/img.jpg",
      price: "1299",
      currency: "INR",
    });
    expect(link.productTitle).toBe("Gold Locket");
    expect(link.productImageUrl).toBe("https://example.com/img.jpg");
    expect(link.productPrice).toBe("1299");
    expect(link.productCurrency).toBe("INR");
  });

  it("does not fail when a product-data provider errors", async () => {
    const { db } = makeFakeDb();
    const failing: ProductDataProvider = {
      name: "failing",
      fetch: async () => {
        throw new Error("provider down");
      },
    };
    const service = new AffiliateLinkService(db, failing);
    const link = await service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW", title: "kept" });
    expect(link.productTitle).toBe("kept");
  });

  it("rejects a missing url", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(service.createLink({ url: "" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects non-https urls", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(service.createLink({ url: "http://www.amazon.in/dp/B08N5WRWNW" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects non-amazon host urls (open-redirect guard)", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(service.createLink({ url: "https://evil.example/dp/B08N5WRWNW" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a client-supplied tag that differs from the server tag", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(
      service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW", tag: "evil-other-21" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts an explicit matching tag", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    const link = await service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW", tag: "zorajewellery-21" });
    expect(link.destination).toContain("tag=zorajewellery-21");
  });

  it("passes the extracted ASIN to the product-data provider", async () => {
    const { db } = makeFakeDb();
    const seen: ProductDataFetchInput[] = [];
    const spy: ProductDataProvider = {
      name: "spy",
      fetch: async (input) => {
        seen.push(input);
        return {};
      },
    };
    await new AffiliateLinkService(db, spy).createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW" });
    expect(seen[0]).toEqual({ url: "https://www.amazon.in/dp/B08N5WRWNW", asin: "B08N5WRWNW" });
  });

  it("records a click (privacy-aware, truncated metadata) and returns destination", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    const link = await service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW" });
    const destination = await service.recordClick(link.id, {
      userAgent: "test-agent".repeat(200),
      referrer: "https://ref.example",
    });
    expect(destination).toBe(link.destination);
    const clicks = await db.affiliateLinkClick.findMany();
    expect(clicks).toHaveLength(1);
    expect(clicks[0].userAgent).toHaveLength(512);
    expect(clicks[0].referrer).toBe("https://ref.example");
  });

  it("defaults or normalizes the content channel (config value, no hard-coded branch)", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    const lower = await service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW", channel: "pinterest" });
    expect(lower.channel).toBe("PINTEREST");
  });

  it("rejects an unknown content channel", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(
      service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW", channel: "telegram" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws 404 when recording a click for a missing link", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(service.recordClick("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws 404 when getting a missing link", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("removes a link (click cascade in real DB)", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    const link = await service.createLink({ url: "https://www.amazon.in/dp/B08N5WRWNW" });
    const res = await service.remove(link.id);
    expect(res.deleted).toBe(true);
    await expect(service.recordClick(link.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws 404 when removing a missing link", async () => {
    const { db } = makeFakeDb();
    const service = new AffiliateLinkService(db, manualProvider());
    await expect(service.remove("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});