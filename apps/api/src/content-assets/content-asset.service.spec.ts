import { BadRequestException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ContentAssetService } from "./content-asset.service";
import { ContentQaService } from "../content-qa/content-qa.service";
import { isPreApprovedPublishAsset, PRE_APPROVED_PUBLISH_ASSET_IDS, QaVerdict } from "../content-qa/content-qa.rules";
import { makeFakeDb } from "../test/fake-db";

describe("ContentAssetService", () => {
  const seedLink = async (db: ReturnType<typeof makeFakeDb>["db"], destination?: string) =>
    db.affiliateLink.create({
      data: {
        provider: "amazon-associates",
        destination: destination ?? "https://www.amazon.in/dp/B08N5WRWNW?tag=zorajewellery-21",
      },
    });

  const makeService = (db: ReturnType<typeof makeFakeDb>["db"]) =>
    new ContentAssetService(db, new ContentQaService(db));

  // Compliant copy: both QA gates pass once disclosureAdded is set.
  const seedCompliantAsset = async (db: ReturnType<typeof makeFakeDb>["db"]) => {
    const link = await seedLink(db);
    return makeService(db).create({
      title: "Sterling Silver Anklet Chain",
      description: "Handmade sterling silver anklet. Disclosure: As an Amazon Associate I earn from qualifying purchases.",
      linkId: link.id,
    });
  };

  it("creates an asset with defaults (unpublished, no disclosure)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const asset = await makeService(db).create({ title: " 4mm Gold Chain  ", linkId: link.id, description: "caption" });
    expect(asset.title).toBe("4mm Gold Chain");
    expect(asset.description).toBe("caption");
    expect(asset.published).toBe(false);
    expect(asset.disclosureAdded).toBe(false);
  });

  it("requires a title", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await expect(makeService(db).create({ title: " ", linkId: link.id })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a missing destination link (404)", async () => {
    const { db } = makeFakeDb();
    await expect(makeService(db).create({ title: "x", linkId: "nope" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("blocks publishing before disclosure is added (Amazon compliance)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = makeService(db);
    const asset = await service.create({ title: "chain", linkId: link.id });
    await expect(service.update(asset.id, { published: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("publishes after disclosure is added and stamps the manual publish date", async () => {
    const { db } = makeFakeDb();
    const service = makeService(db);
    const asset = await seedCompliantAsset(db);
    await service.update(asset.id, { disclosureAdded: true });
    const published = await service.update(asset.id, { published: true });
    expect(published.published).toBe(true);
    expect(published.publishedAt).toBeTruthy();
    expect(published.disclosureAdded).toBe(true);
  });

  it("cannot remove disclosure while still published", async () => {
    const { db } = makeFakeDb();
    const service = makeService(db);
    const asset = await seedCompliantAsset(db);
    await service.update(asset.id, { disclosureAdded: true });
    await service.update(asset.id, { published: true });
    await expect(service.update(asset.id, { disclosureAdded: false })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("unpublishing clears the publish date and re-allows disclosure removal", async () => {
    const { db } = makeFakeDb();
    const service = makeService(db);
    const asset = await seedCompliantAsset(db);
    await service.update(asset.id, { disclosureAdded: true });
    await service.update(asset.id, { published: true });
    const unpublished = await service.update(asset.id, { published: false });
    expect(unpublished.published).toBe(false);
    expect(unpublished.publishedAt).toBeNull();
    await expect(service.update(asset.id, { disclosureAdded: false })).resolves.toMatchObject({
      disclosureAdded: false,
    });
  });

  it("rejects an empty title on update", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = makeService(db);
    const asset = await service.create({ title: "chain", linkId: link.id });
    await expect(service.update(asset.id, { title: "  " })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("QA-01 rejects publishing when the copy lacks a disclosure sentence despite the flag", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = makeService(db);
    const asset = await service.create({
      title: "Sterling Silver Anklet Chain",
      description: "Square and round anklets in one size.",
      linkId: link.id,
    });
    await service.update(asset.id, { disclosureAdded: true });

    const err = await service.update(asset.id, { published: true }).catch((e) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    const verdict = err.response.verdict as QaVerdict;
    expect(verdict.publishReady).toBe(false);
    expect(verdict.networkCompliancePass).toBe(false);
    expect(verdict.checks.find((c) => c.id === "disclosure_sentence_present")!.pass).toBe(false);

    // rejected publish must not persist
    const after = await service.get(asset.id);
    expect(after.published).toBe(false);
    expect(after.publishedAt).toBeFalsy();
  });

  it("QA-01 rejects publishing when the destination is not Amazon (network gate)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db, "https://example.com/not-amazon");
    const service = makeService(db);
    const asset = await service.create({
      title: "Sterling Silver Anklet Chain",
      description: "Handmade sterling silver anklet. Disclosure: As an Amazon Associate I earn from qualifying purchases.",
      linkId: link.id,
    });
    await service.update(asset.id, { disclosureAdded: true });

    const err = await service.update(asset.id, { published: true }).catch((e) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err.response.verdict as QaVerdict).checks.find((c) => c.id === "destination_https_amazon")!.pass).toBe(false);
  });

  it("QA-01 evaluates the PROSPECTIVE state in the same patch (title+description+publish)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = makeService(db);
    const asset = await service.create({ title: "x", linkId: link.id }); // stored state would FAIL QA

    const published = await service.update(asset.id, {
      title: "Sterling Silver Anklet Chain",
      description: "Handmade sterling silver anklet. Disclosure: As an Amazon Associate I earn from qualifying purchases.",
      disclosureAdded: true,
      published: true,
    });
    expect(published.published).toBe(true);
    expect(published.title).toBe("Sterling Silver Anklet Chain");
  });

  it("QA-01 pre-approved live asset bypasses the gate (Campaign #3 can never be blocked)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = makeService(db);
    const liveId = [...PRE_APPROVED_PUBLISH_ASSET_IDS][0];
    const asset = await db.contentAsset.create({
      data: { id: liveId, title: "Anklet", linkId: link.id, disclosureAdded: true },
    });
    const published = await service.update(asset.id, { published: true });
    expect(published.published).toBe(true);
  });

  it("pre-approval membership matches the live Campaign #3 asset id only", () => {
    expect(isPreApprovedPublishAsset("cmuczfp6y0002ah1g7fjqmuxd")).toBe(true);
    expect(isPreApprovedPublishAsset("some-other-asset")).toBe(false);
  });

  it("lists, gets and removes assets (404 for missing)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = makeService(db);
    await service.create({ title: "a", linkId: link.id });
    await service.create({ title: "b", linkId: link.id });
    expect(await service.list()).toHaveLength(2);
    const first = (await service.list())[0];
    expect((await service.get(first.id)).title).toBeDefined();
    await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove("nope")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(first.id)).resolves.toMatchObject({ deleted: true });
    expect(await service.list()).toHaveLength(1);
  });
});