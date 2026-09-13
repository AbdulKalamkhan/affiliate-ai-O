import { BadRequestException, NotFoundException } from "@nestjs/common";
import { OpportunityService } from "./opportunity.service";
import { makeFakeDb } from "../test/fake-db";

describe("OpportunityService", () => {
  it("creates an opportunity with trimmed fields and default status", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    const created = await service.create({ name: "  Gold Chain  ", category: "Jewellery", notes: " manual " });
    expect(created.name).toBe("Gold Chain");
    expect(created.category).toBe("Jewellery");
    expect(created.notes).toBe("manual");
    expect(created.status).toBe("researching");
  });

  it("creates with explicit status", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    const created = await service.create({ name: "Ring", status: "shortlisted" });
    expect(created.status).toBe("shortlisted");
  });

  it("rejects empty name", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    await expect(service.create({ name: "   " })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: "" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unknown status", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    await expect(service.create({ name: "x", status: "approved" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists opportunities", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    await service.create({ name: "a" });
    await service.create({ name: "b" });
    expect(await service.list()).toHaveLength(2);
  });

  it("throws 404 when getting a missing opportunity", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updates status", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    const created = await service.create({ name: "a" });
    const updated = await service.update(created.id, { status: "live" });
    expect(updated.status).toBe("live");
  });

  it("rejects unknown status on update", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    const created = await service.create({ name: "a" });
    await expect(service.update(created.id, { status: "bogus" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws 404 when updating a missing opportunity", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    await expect(service.update("nope", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("removes an opportunity", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    const created = await service.create({ name: "gone" });
    const res = await service.remove(created.id);
    expect(res.deleted).toBe(true);
    await expect(service.get(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws 404 when removing a missing opportunity", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityService(db);
    await expect(service.remove("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});