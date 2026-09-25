import { NotFoundException } from "@nestjs/common";
import { makeFakeDb } from "../test/fake-db";
import { ContentQaService } from "./content-qa.service";
import { evaluateContentQa } from "./content-qa.rules";

describe("ContentQaService", () => {
  it("evaluates a compliant asset as publish-ready (both gates pass)", async () => {
    const { db } = makeFakeDb();
    const link = await db.affiliateLink.create({
      data: { provider: "amazon-associates", destination: "https://www.amazon.in/dp/B08BG1HC7R?tag=x", channel: "PINTEREST" },
    });
    const asset = await db.contentAsset.create({
      data: {
        title: "925 Silver Nazariya Anklet for Women",
        description: "Certified 925 sterling silver anklet. Disclosure: As an Amazon Associate I earn from qualifying purchases.",
        linkId: link.id,
        disclosureAdded: true,
        published: true,
      },
    });
    const service = new ContentQaService(db);

    const { verdict } = await service.evaluate(asset.id);
    expect(verdict.publishReady).toBe(true);
    expect(verdict.networkCompliancePass).toBe(true);
    expect(verdict.contentQualityPass).toBe(true);
    expect(verdict.mandatoryChecksPass).toBe(true);
  });

  it("blocks publish when disclosure Missing from description despite flag", async () => {
    const { db } = makeFakeDb();
    const link = await db.affiliateLink.create({
      data: { provider: "amazon-associates", destination: "https://www.amazon.in/dp/B08BG1HC7R?tag=x", channel: "PINTEREST" },
    });
    const asset = await db.contentAsset.create({
      data: {
        title: "Anklet",
        description: "Lovely anklet, comes in one size.",
        linkId: link.id,
        disclosureAdded: true,
        published: false,
      },
    });
    const service = new ContentQaService(db);

    const { verdict } = await service.evaluate(asset.id);
    expect(verdict.networkCompliancePass).toBe(false);
    expect(verdict.publishReady).toBe(false);
    const disclosureCheck = verdict.checks.find((c) => c.id === "disclosure_sentence_present")!;
    expect(disclosureCheck.pass).toBe(false);
  });

  it("raises on misleading price claims and non-amazon destinations", async () => {
    const { db } = makeFakeDb();
    const link = await db.affiliateLink.create({
      data: { provider: "amazon-associates", destination: "https://example.com/not-amazon", channel: "PINTEREST" },
    });
    const asset = await db.contentAsset.create({
      data: {
        title: "Anklet only ₹500!!",
        description: "Was ₹999, now 50% off. Disclosure: affiliate.",
        linkId: link.id,
        disclosureAdded: true,
      },
    });
    const service = new ContentQaService(db);

    const { verdict } = await service.evaluate(asset.id);
    expect(verdict.checks.find((c) => c.id === "no_misleading_claims")!.pass).toBe(false);
    expect(verdict.checks.find((c) => c.id === "destination_https_amazon")!.pass).toBe(false);
  });

  it("flags fake-review language", async () => {
    const { db } = makeFakeDb();
    const link = await db.affiliateLink.create({
      data: { provider: "amazon-associates", destination: "https://www.amazon.in/dp/X?tag=x", channel: "PINTEREST" },
    });
    const asset = await db.contentAsset.create({
      data: {
        title: "Anklet",
        description: "Best product on Amazon, customer favorite. Disclosure: As an Amazon Associate I earn.",
        linkId: link.id,
        disclosureAdded: true,
      },
    });
    const service = new ContentQaService(db);
    const { verdict } = await service.evaluate(asset.id);
    expect(verdict.checks.find((c) => c.id === "no_fake_reviews")!.pass).toBe(false);
  });

  it("detects a near-duplicate sibling", async () => {
    const { db } = makeFakeDb();
    const link = await db.affiliateLink.create({
      data: { provider: "amazon-associates", destination: "https://www.amazon.in/dp/X?tag=x", channel: "PINTEREST" },
    });
    const title = "925 Silver Anklet";
    const description = "Certified 925 silver. Disclosure: As an Amazon Associate I earn from qualifying purchases.";
    const a = await db.contentAsset.create({
      data: { title, description, linkId: link.id, disclosureAdded: true },
    });
    await db.contentAsset.create({
      data: { title, description, linkId: link.id, disclosureAdded: true },
    });
    const service = new ContentQaService(db);
    const { verdict } = await service.evaluate(a.id);
    expect(verdict.checks.find((c) => c.id === "no_near_duplicate")!.pass).toBe(false);
  });

  it("throws 404 for a missing asset", async () => {
    const { db } = makeFakeDb();
    const service = new ContentQaService(db);
    await expect(service.evaluate("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("pure rules engine: rejects non-disclosure by default, even unpublished", () => {
    const verdict = evaluateContentQa({
      title: "Anklet",
      description: null,
      published: false,
      disclosureAdded: false,
      destination: "https://www.amazon.in/dp/X",
      hasSiblingDuplicate: false,
    });
    expect(verdict.publishReady).toBe(false);
    expect(verdict.checks.find((c) => c.id === "disclosure_declared")!.pass).toBe(false);
  });
});