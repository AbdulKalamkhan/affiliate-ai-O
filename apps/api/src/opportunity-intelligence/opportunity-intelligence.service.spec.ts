import { BadRequestException, NotFoundException } from "@nestjs/common";
import { makeFakeDb } from "../test/fake-db";
import { OpportunityIntelligenceService, SCORE_WEIGHTS } from "./opportunity-intelligence.service";

const ev = (factor: string, value: number, quality: string, claim = "c") => ({ factor, value, quality, claim });

describe("OpportunityIntelligenceService", () => {
  it("records evidence against an existing opportunity and lists it newest-first", async () => {
    const { db } = makeFakeDb();
    const opp = await db.opportunity.create({ data: { name: "GIVA anklet" } });
    const service = new OpportunityIntelligenceService(db);

    const a = await service.addEvidence(opp.id, ev("demand", 0.8, "FACT"));
    const b = await service.addEvidence(opp.id, ev("trend", 0.6, "ESTIMATE"));

    const list = await service.listEvidence(opp.id);
    expect(list.map((e) => e.id)).toEqual([b.id, a.id]);
  });

  it("validates factor, quality and value", async () => {
    const { db } = makeFakeDb();
    const opp = await db.opportunity.create({ data: { name: "x" } });
    const service = new OpportunityIntelligenceService(db);

    await expect(service.addEvidence(opp.id, ev("nope", 0.5, "FACT"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addEvidence(opp.id, ev("demand", 0.5, "MAYBE"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addEvidence(opp.id, ev("demand", 1.5, "FACT"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addEvidence(opp.id, ev("demand", -0.1, "FACT"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addEvidence(opp.id, { factor: "demand", quality: "FACT", value: 0.5, claim: "" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns 404 for evidence on a missing opportunity", async () => {
    const { db } = makeFakeDb();
    const service = new OpportunityIntelligenceService(db);
    await expect(service.addEvidence("nope", ev("demand", 0.5, "FACT"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("scores deterministically from highest-quality evidence per factor", async () => {
    const { db } = makeFakeDb();
    const opp = await db.opportunity.create({ data: { name: "x" } });
    const service = new OpportunityIntelligenceService(db);

    await service.addEvidence(opp.id, ev("demand", 1, "INFERENCE"));
    await service.addEvidence(opp.id, ev("demand", 0.5, "FACT"));
    await service.addEvidence(opp.id, ev("risk", 0.4, "ESTIMATE"));

    const s1 = await service.score(opp.id);
    const s2 = await service.score(opp.id);
    expect(s1).toEqual(s2);

    const demand = s1.components.find((c) => c.factor === "demand");
    expect(demand!.value).toBe(0.5);
    expect(demand!.quality).toBe("FACT");

    const expectedTotal = SCORE_WEIGHTS.demand.weight * 1 * 0.5 + SCORE_WEIGHTS.risk.weight * -1 * 0.4 * 0.75;
    expect(s1.total).toBe(Math.round(expectedTotal * 1000) / 1000);
  });

  it("ranks opportunities by evidence-backed score and only counts known-quality claims", async () => {
    const { db } = makeFakeDb();
    const strong = await db.opportunity.create({ data: { name: "strong" } });
    const weak = await db.opportunity.create({ data: { name: "weak" } });
    const huge = await db.opportunity.create({ data: { name: "huge" } });
    const service = new OpportunityIntelligenceService(db);

    await service.addEvidence(strong.id, ev("demand", 1, "FACT"));
    await service.addEvidence(weak.id, ev("demand", 0.2, "FACT"));
    await service.addEvidence(huge.id, ev("demand", 1, "UNKNOWN")); // unknown quality → zero weight

    const ranked = await service.rank();
    expect(ranked.map((r) => r.opportunity.name)).toEqual([strong.name, weak.name, huge.name]);
    const hugeScore = ranked.find((r) => r.opportunity.name === "huge")!;
    expect(hugeScore.total).toBe(0);
  });

  it("ranks tie-breaks by earliest createdAt", async () => {
    const { db } = makeFakeDb();
    const first = await db.opportunity.create({ data: { name: "first" } });
    const second = await db.opportunity.create({ data: { name: "second" } });
    const service = new OpportunityIntelligenceService(db);
    await service.addEvidence(first.id, ev("demand", 0.5, "FACT"));
    await service.addEvidence(second.id, ev("demand", 0.5, "FACT"));

    const ranked = await service.rank();
    expect(ranked.map((r) => r.opportunity.name)).toEqual([first.name, second.name]);
  });
});