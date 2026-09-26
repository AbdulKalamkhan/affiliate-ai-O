import { BadRequestException, NotFoundException } from "@nestjs/common";
import { RevenueService } from "./revenue.service";
import { makeFakeDb } from "../test/fake-db";

describe("RevenueService", () => {
  it("rejects missing provider", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    await expect(service.record({ provider: "   ", value: 100 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects non-positive or non-finite value", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    await expect(service.record({ provider: "amazon", value: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.record({ provider: "amazon", value: -5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.record({ provider: "amazon", value: Number.NaN })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a pending revenue event with trimmed provider and defaults", async () => {
    const { db, rows } = makeFakeDb();
    const service = new RevenueService(db);
    const created = await service.record({ provider: "  amazon-associates  ", value: 100.5, sourceId: "  ORD-1  " });
    expect(created.provider).toBe("amazon-associates");
    expect(created.sourceId).toBe("ORD-1");
    expect(created.eventType).toBe("sale");
    expect(created.currency).toBe("INR");
    expect(created.status).toBe("pending");
    expect(created.value).toBe(100.5);
    expect(created.occurredAt).toBeInstanceOf(Date);
    expect(rows["revenueEvent"]).toHaveLength(1);
  });

  it("is idempotent for the same provider+sourceId", async () => {
    const { db, rows } = makeFakeDb();
    const service = new RevenueService(db);
    const first = await service.record({ provider: "amazon", sourceId: "ORD-1", value: 100 });
    const second = await service.record({ provider: "amazon", sourceId: "ORD-1", value: 999 });
    expect(second.id).toBe(first.id);
    expect(rows["revenueEvent"]).toHaveLength(1);
  });

  it("creates separate events when sourceId differs or is absent", async () => {
    const { db, rows } = makeFakeDb();
    const service = new RevenueService(db);
    await service.record({ provider: "amazon", sourceId: "ORD-1", value: 100 });
    await service.record({ provider: "amazon", sourceId: "ORD-2", value: 100 });
    await service.record({ provider: "amazon", value: 100 });
    expect(rows["revenueEvent"]).toHaveLength(3);
  });

  it("lists events newest first by occurredAt", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    await service.record({ provider: "amazon", sourceId: "A", value: 100, occurredAt: new Date("2026-09-01") });
    await service.record({ provider: "amazon", sourceId: "B", value: 100, occurredAt: new Date("2026-09-15") });
    const listed = await service.list();
    expect(listed.map((r) => r.sourceId)).toEqual(["B", "A"]);
  });

  it("throws 404 when getting a missing event", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("embeds the linked profit record when reading an event (audit trail)", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const event = await service.record({ provider: "amazon", sourceId: "ORD-1", value: 120 });
    await service.reconcile(event.id, { grossAmount: 120, feeAmount: 20, costAmount: 10, source: "report-1" });
    const audit = await service.get(event.id);
    expect(audit.profitRecord).not.toBeNull();
    expect(audit.profitRecord!.netProfit).toBe(90);
    expect(audit.profitRecord!.source).toBe("report-1");
    const pending = await service.record({ provider: "amazon", sourceId: "ORD-2", value: 50 });
    const pendingAudit = await service.get(pending.id);
    expect(pendingAudit.profitRecord).toBeNull();
  });

  it("reconciles a pending event into a profit record with correct math", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const event = await service.record({ provider: "amazon", sourceId: "ORD-1", value: 120 });
    const result = await service.reconcile(event.id, { grossAmount: 120, feeAmount: 20, costAmount: 10 });
    expect(result.profitRecord.sourceType).toBe("affiliate");
    expect(result.profitRecord.source).toBe(`amazon:ORD-1`);
    expect(result.profitRecord.grossAmount).toBe(120);
    expect(result.profitRecord.feeAmount).toBe(20);
    expect(result.profitRecord.costAmount).toBe(10);
    expect(result.profitRecord.netProfit).toBe(90);
    expect(result.profitRecord.currency).toBe("INR");
    expect(result.profitRecord.revenueEventId).toBe(event.id);
    expect(result.event.status).toBe("reconciled");
    const after = await service.get(event.id);
    expect(after.status).toBe("reconciled");
  });

  it("allows a negative net profit (loss) when costs exceed gross", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const event = await service.record({ provider: "amazon", sourceId: "ORD-1", value: 50 });
    const result = await service.reconcile(event.id, {
      grossAmount: 50,
      feeAmount: 5,
      costAmount: 60,
      source: "evidence-2",
    });
    expect(result.profitRecord.netProfit).toBe(-15);
    expect(result.profitRecord.source).toBe("evidence-2");
  });

  it("rejects non-finite or negative amounts during reconcile", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const event = await service.record({ provider: "amazon", value: 100 });
    await expect(
      service.reconcile(event.id, { grossAmount: Number.NaN, feeAmount: 0, costAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reconcile(event.id, { grossAmount: 100, feeAmount: -1, costAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to reconcile an already reconciled or rejected event", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const ok = await service.record({ provider: "amazon", value: 100 });
    await service.reconcile(ok.id, { grossAmount: 100, feeAmount: 0, costAmount: 0 });
    await expect(
      service.reconcile(ok.id, { grossAmount: 100, feeAmount: 0, costAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const rejected = await service.record({ provider: "amazon", value: 100 });
    await service.reject(rejected.id);
    await expect(
      service.reconcile(rejected.id, { grossAmount: 100, feeAmount: 0, costAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws 404 when reconciling a missing event", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    await expect(
      service.reconcile("nope", { grossAmount: 100, feeAmount: 0, costAmount: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a pending event and refuses double rejection", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const event = await service.record({ provider: "amazon", value: 100 });
    const rejected = await service.reject(event.id);
    expect(rejected.status).toBe("rejected");
    await expect(service.reject(event.id)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reconcile(event.id, { grossAmount: 100, feeAmount: 0, costAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws 404 when rejecting a missing event", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    await expect(service.reject("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("money integrity", () => {
    it("records an audit row for every revenue write (no silent money change)", async () => {
      const { db, rows } = makeFakeDb();
      const service = new RevenueService(db);
      const event = await service.record({ provider: "amazon", sourceId: "A1", value: 250, actor: "owner" });

      const audit = rows.bossAuditLog.filter((r) => r.entityId === event.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].verb).toBe("money_write");
      expect(audit[0].actor).toBe("owner");
      expect(audit[0].entityType).toBe("revenue_event");
    });

    it("audits reconcile and reject money writes with the full component breakdown", async () => {
      const { db, rows } = makeFakeDb();
      const service = new RevenueService(db);
      const reconciled = await service.record({ provider: "amazon", sourceId: "A1", value: 250 });
      const { profitRecord } = await service.reconcile(reconciled.id, {
        grossAmount: 250,
        feeAmount: 25,
        costAmount: 100,
        actor: "owner",
      });
      const rejectedEvent = await service.record({ provider: "amazon", sourceId: "A2", value: 50 });
      await service.reject(rejectedEvent.id, "owner");

      const profitAudit = rows.bossAuditLog.find((r) => r.entityId === profitRecord.id);
      expect(profitAudit?.verb).toBe("money_write");
      expect(profitAudit?.actor).toBe("owner");
      expect((profitAudit?.detail as { netProfit: number }).netProfit).toBe(125);
      expect(rows.bossAuditLog.some((r) => r.entityId === rejectedEvent.id && r.verb === "money_write")).toBe(true);
    });

    it("reconcile is atomic: a failed transaction leaves NO profit record and a PENDING event", async () => {
      const fake = makeFakeDb();
      const service = new RevenueService(fake.db);
      const event = await service.record({ provider: "amazon", sourceId: "A1", value: 250 });

      fake.failNextTransaction();
      await expect(
        service.reconcile(event.id, { grossAmount: 250, feeAmount: 25, costAmount: 100 }),
      ).rejects.toThrow();

      expect(fake.rows.profitRecord).toHaveLength(0);
      const after = await service.get(event.id);
      expect(after.status).toBe("pending");
      // A retry after the failure must still succeed and produce exactly one profit record.
      const retried = await service.reconcile(event.id, { grossAmount: 250, feeAmount: 25, costAmount: 100 });
      expect(retried.profitRecord.netProfit).toBe(125);
      expect(fake.rows.profitRecord).toHaveLength(1);
    });

    it("a rolled-back money write leaves no partial state", async () => {
      const fake = makeFakeDb();
      const service = new RevenueService(fake.db);
      fake.failNextTransaction();
      await expect(service.record({ provider: "amazon", sourceId: "A1", value: 250 })).rejects.toThrow();
      expect(fake.rows.revenueEvent).toHaveLength(0);
      expect(fake.rows.bossAuditLog).toHaveLength(0);
      expect(fake.transactions.rolledBack).toBe(1);
    });
  });

  it("raises a concentration risk alert when one provider exceeds 90% of verified revenue", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const big = await service.record({ provider: "amazon-associates", sourceId: "A1", value: 100 });
    await service.reconcile(big.id, { grossAmount: 100, feeAmount: 0, costAmount: 0 });
    const small = await service.record({ provider: "ebay-afp", sourceId: "B1", value: 5 });
    await service.reconcile(small.id, { grossAmount: 5, feeAmount: 0, costAmount: 0 });

    const c = await service.concentration();
    expect(c.totalRevenue).toBe(105);
    expect(c.providerCount).toBe(2);
    const amazon = c.providers.find((p) => p.provider === "amazon-associates")!;
    expect(amazon.sharePct).toBe(95.24); // ~100/105
    expect(amazon.riskAlert).toBe(true);
    expect(c.riskAlerts.map((p) => p.provider)).toEqual(["amazon-associates"]);
  });

  it("does not count pending or rejected events toward concentration", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const verified = await service.record({ provider: "amazon-associates", sourceId: "A1", value: 10 });
    await service.reconcile(verified.id, { grossAmount: 10, feeAmount: 0, costAmount: 0 });
    await service.record({ provider: "pending-network", sourceId: "P1", value: 1000 });
    const rejected = await service.record({ provider: "rejected-network", sourceId: "R1", value: 900 });
    await service.reject(rejected.id);

    const c = await service.concentration();
    expect(c.totalRevenue).toBe(10);
    expect(c.providerCount).toBe(1);
    expect(c.providers[0].sharePct).toBe(100);
  });

  it("returns an empty concentration when no verified revenue exists", async () => {
    const { db } = makeFakeDb();
    const service = new RevenueService(db);
    const c = await service.concentration();
    expect(c.totalRevenue).toBe(0);
    expect(c.providerCount).toBe(0);
    expect(c.riskAlerts).toEqual([]);
  });
});