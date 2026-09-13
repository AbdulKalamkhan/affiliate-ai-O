import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ContentAssetService } from "./content-asset.service";
import { makeFakeDb } from "../test/fake-db";

describe("ContentAssetService", () => {
  const seedLink = async (db: ReturnType<typeof makeFakeDb>["db"]) =>
    db.affiliateLink.create({
      data: {
        provider: "amazon-associates",
        destination: "https://www.amazon.in/dp/B08N5WRWNW?tag=zorajewellery-21",
      },
    });

  it("creates an asset with defaults (unpublished, no disclosure)", async () => {
    const { db } = makeFakeDb();
    const service = new ContentAssetService(db);
    const link = await seedLink(db);
    const asset = await service.create({ title: " 4mm Gold Chain  ", linkId: link.id, description: "caption" });
    expect(asset.title).toBe("4mm Gold Chain");
    expect(asset.description).toBe("caption");
    expect(asset.published).toBe(false);
    expect(asset.disclosureAdded).toBe(false);
  });

  it("requires a title", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    await expect(new ContentAssetService(db).create({ title: " ", linkId: link.id })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a missing destination link (404)", async () => {
    const { db } = makeFakeDb();
    await expect(new ContentAssetService(db).create({ title: "x", linkId: "nope" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("blocks publishing before disclosure is added (Amazon compliance)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = new ContentAssetService(db);
    const asset = await service.create({ title: "chain", linkId: link.id });
    await expect(service.update(asset.id, { published: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("publishes after disclosure is added and stamps the manual publish date", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = new ContentAssetService(db);
    const asset = await service.create({ title: "chain", linkId: link.id });
    await service.update(asset.id, { disclosureAdded: true });
    const published = await service.update(asset.id, { published: true });
    expect(published.published).toBe(true);
    expect(published.publishedAt).toBeTruthy();
    expect(published.disclosureAdded).toBe(true);
  });

  it("cannot remove disclosure while still published", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = new ContentAssetService(db);
    const asset = await service.create({ title: "chain", linkId: link.id });
    await service.update(asset.id, { disclosureAdded: true });
    await service.update(asset.id, { published: true });
    await expect(service.update(asset.id, { disclosureAdded: false })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("unpublishing clears the publish date and re-allows disclosure removal", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = new ContentAssetService(db);
    const asset = await service.create({ title: "chain", linkId: link.id });
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
    const service = new ContentAssetService(db);
    const asset = await service.create({ title: "chain", linkId: link.id });
    await expect(service.update(asset.id, { title: "  " })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists, gets and removes assets (404 for missing)", async () => {
    const { db } = makeFakeDb();
    const link = await seedLink(db);
    const service = new ContentAssetService(db);
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