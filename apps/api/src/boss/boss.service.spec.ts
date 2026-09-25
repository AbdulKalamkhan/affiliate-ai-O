import { BadRequestException, NotFoundException } from "@nestjs/common";
import { BossService, DEFAULT_AUTONOMY_LEVEL } from "./boss.service";
import { makeFakeDb } from "../test/fake-db";

describe("BossService", () => {
  it("creates a command and a structured plan with proposed actions", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    const res = await service.create({ text: "Research gold jewellery niche" });

    expect(res.status).toBe("planned");
    expect(res.autonomyLevel).toBe(DEFAULT_AUTONOMY_LEVEL);
    expect(res.plan).toBeDefined();
    expect(res.plan!.objective).toContain("Research opportunities");
    expect(Array.isArray(res.plan!.tasks)).toBe(true);
    expect(res.plan!.tasks!.length).toBeGreaterThan(0);
    expect(res.plan!.tasks![0].actions[0].status).toBe("proposed");
  });

  it("detects content intent and proposes publish tools", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    const res = await service.create({ text: "Create and publish a pin for a gold chain" });

    const tools = res.plan!.tasks!.flatMap((t) => t.actions.map((a) => a.tool));
    expect(tools).toContain("content.draft");
    expect(tools).toContain("affiliate.publish");
  });

  it("denies external-execution tools at default autonomy but keeps the plan", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    const res = await service.create({ text: "Publish 5 new pins to my boards" });

    const publish = res.plan!.tasks!.flatMap((t) => t.actions).find((a) => a.tool === "affiliate.publish");
    expect(publish).toBeDefined();
    expect(publish!.permissionResult).toBe("denied");
    expect(publish!.requiredAutonomy).toBe(4);
    expect(publish!.status).toBe("proposed");
  });

  it("grants publish permission at autonomy 4", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    const res = await service.create({ text: "Publish 5 new pins to my boards", autonomyLevel: 4 });

    const publish = res.plan!.tasks!.flatMap((t) => t.actions).find((a) => a.tool === "affiliate.publish");
    expect(publish!.permissionResult).toBe("granted");
  });

  it("writes an audit trail for command, plan, tasks and actions", async () => {
    const { db, rows } = makeFakeDb();
    const service = new BossService(db);
    await service.create({ text: "show me the revenue report" });

    const verbSummary = rows.bossAuditLog.map((l) => l.verb as string);
    expect(verbSummary).toContain("created");
    expect(verbSummary).toContain("planned");
    expect(verbSummary).toContain("permission_checked");
  });

  it("rejects an empty command", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    await expect(service.create({ text: "   " })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ text: "" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an invalid autonomy level", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    await expect(service.create({ text: "x", autonomyLevel: 7 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ text: "x", autonomyLevel: -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ text: "x", autonomyLevel: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists commands newest-first", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    const a = await service.create({ text: "a" });
    const b = await service.create({ text: "b" });
    const list = await service.list();
    expect(list.map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it("throws 404 when getting a missing command", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects an oversized command text", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    await expect(service.create({ text: "x".repeat(4001) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("audits autonomy and status updates", async () => {
    const { db, rows } = makeFakeDb();
    const service = new BossService(db);
    const created = await service.create({ text: "report revenue" });
    const auditRef = rows.bossAuditLog.length;

    await service.update(created.id, { autonomyLevel: 4 });

    const added = rows.bossAuditLog.slice(auditRef);
    const updatedVerb = added.find((l) => l.verb === "updated");
    expect(updatedVerb).toBeDefined();
    expect(updatedVerb!.detail).toEqual({ autonomyLevel: 4 });
    expect((rows.bossCommand.find((c) => c.id === created.id)?.status as string) ?? "").toBe("planned");
  });

  it("archives a command on remove and preserves its audit trail", async () => {
    const { db, rows } = makeFakeDb();
    const service = new BossService(db);
    const created = await service.create({ text: "report revenue" });
    const auditCount = rows.bossAuditLog.length;

    const res = await service.remove(created.id);

    expect(res.archived).toBe(true);
    const command = rows.bossCommand.find((c) => c.id === created.id);
    expect(command?.status).toBe("archived");
    expect(rows.bossAuditLog.length).toBe(auditCount + 1);
    expect(rows.bossAuditLog.some((l) => l.commandId === created.id && l.verb === "archived")).toBe(true);
  });
});