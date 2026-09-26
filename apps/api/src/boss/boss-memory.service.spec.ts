import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import { makeFakeDb } from "../test/fake-db";
import { BossMemoryService } from "./boss-memory.service";

describe("BossMemoryService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let service: BossMemoryService;

  beforeEach(() => {
    db = makeFakeDb();
    service = new BossMemoryService(db.db);
  });

  it("upserts memory by key instead of duplicating", async () => {
    await service.remember({ key: "assoc.tag", kind: "fact", value: { tag: "zorajewellery-21" } });
    await service.remember({ key: "assoc.tag", kind: "fact", value: { tag: "zorajewellery-21" }, weight: 0.9 });
    expect(db.rows.bossMemory).toHaveLength(1);
    expect(db.rows.bossMemory[0].weight).toBe(0.9);
  });

  it("rejects an unknown memory kind", async () => {
    await expect(service.remember({ key: "k", kind: "guess" as never, value: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("requires a decision rationale", async () => {
    await expect(service.recordDecision({ decision: "publish", rationale: "" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("derives a lesson only after an observed outcome", async () => {
    const decision = await service.recordDecision({
      decision: "expect conversion from campaign c3",
      rationale: "4 clicks recorded, no conversion yet",
      confidence: 0.4,
    });
    expect(db.rows.bossLesson).toHaveLength(0);

    const lesson = await service.recordOutcome({
      decisionId: decision.id as string,
      actual: "no conversion after 7 days",
      success: false,
    });
    expect(db.rows.bossLesson).toHaveLength(1);
    expect(String(lesson.lesson)).toContain("no conversion after 7 days");
  });

  it("keeps outcomes immutable", async () => {
    const decision = await service.recordDecision({ decision: "d", rationale: "r" });
    await service.recordOutcome({ decisionId: decision.id as string, actual: "a", success: true });
    await expect(
      service.recordOutcome({ decisionId: decision.id as string, actual: "b", success: false }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects an outcome for an unknown decision", async () => {
    await expect(
      service.recordOutcome({ decisionId: "nope", actual: "a", success: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reports awaiting_outcomes rather than claiming learning", async () => {
    await service.recordDecision({ decision: "d", rationale: "r" });
    const evidence = await service.learningEvidence();
    expect(evidence.status).toBe("awaiting_outcomes");
    expect(evidence.groundedRatio).toBeNull();
    expect(evidence.pendingOutcomes).toBe(1);
  });

  it("reports no_data on an empty system", async () => {
    const evidence = await service.learningEvidence();
    expect(evidence.status).toBe("no_data");
    expect(evidence.decisions).toBe(0);
  });

  it("refuses to invent a recommendation without grounded lessons", async () => {
    const result = await service.recommendations();
    expect(result.status).toBe("insufficient_evidence");
    expect(result.recommendations).toHaveLength(0);
  });

  it("returns grounded recommendations from failed lessons only", async () => {
    const bad = await service.recordDecision({ decision: "d1", rationale: "r" });
    await service.recordOutcome({ decisionId: bad.id as string, actual: "failed", success: false });
    const good = await service.recordDecision({ decision: "d2", rationale: "r" });
    await service.recordOutcome({ decisionId: good.id as string, actual: "worked", success: true });

    const result = await service.recommendations();
    expect(result.status).toBe("grounded");
    expect(result.groundedLessons).toBe(2);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].actual).toBe("failed");
  });

  it("audits outcome recording with an actor", async () => {
    const decision = await service.recordDecision({ decision: "d", rationale: "r" });
    await service.recordOutcome({ decisionId: decision.id as string, actual: "a", success: true });
    const audit = db.rows.bossAuditLog.find((a) => a.verb === "outcome_recorded");
    expect(audit?.actor).toBe("owner");
  });

  it("reports capability honestly: executor yes, LLM not connected", async () => {
    const capability = await service.capability();
    expect(capability.executor).toBe("implemented");
    expect(capability.llmProvider).toBe("not_connected");
    expect(capability.tools.notImplemented).toContain("affiliate.publish");
    expect(capability.externalSideEffectTools).toContain("affiliate.publish");
    expect(capability.knownToolGuard).toBe(true);
  });
});
