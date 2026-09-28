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

  it("denies a declared level 4 down to the default server ceiling", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    // A declared level is a REQUEST, not an authority: the default ceiling is 2,
    // so level 4 (which affiliate.publish requires) must still be denied.
    const res = await service.create({ text: "Publish 5 new pins to my boards", autonomyLevel: 4 });

    expect(res.autonomyLevel).toBe(DEFAULT_AUTONOMY_LEVEL);
    const publish = res.plan!.tasks!.flatMap((t) => t.actions).find((a) => a.tool === "affiliate.publish");
    expect(publish!.permissionResult).toBe("denied");
  });

  it("audits the autonomy clamp so a reduction is never silent", async () => {
    const { db, rows } = makeFakeDb();
    const service = new BossService(db);
    await service.create({ text: "Publish 5 new pins", autonomyLevel: 5 });

    const clamped = rows.bossAuditLog.find((l) => l.verb === "autonomy_clamped");
    expect(clamped).toBeDefined();
    expect(clamped!.detail).toMatchObject({
      requested: 5,
      effective: DEFAULT_AUTONOMY_LEVEL,
      ownerLevelRefused: true,
    });
  });

  it("grants publish permission only when the server ceiling allows level 4", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    const previous = process.env.OPERATOR_AUTONOMY_CEILING;
    process.env.OPERATOR_AUTONOMY_CEILING = "4";
    try {
      const res = await service.create(
        { text: "Publish 5 new pins to my boards", autonomyLevel: 4 },
        { id: "api-key-owner", role: "owner", authMethod: "api_key" },
      );
      expect(res.autonomyLevel).toBe(4);
      const publish = res.plan!.tasks!.flatMap((t) => t.actions).find((a) => a.tool === "affiliate.publish");
      expect(publish!.permissionResult).toBe("granted");
    } finally {
      if (previous === undefined) delete process.env.OPERATOR_AUTONOMY_CEILING;
      else process.env.OPERATOR_AUTONOMY_CEILING = previous;
    }
  });

  it("refuses level 5 even for the owner unless explicitly opted in", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    const owner = { id: "api-key-owner", role: "owner" as const, authMethod: "api_key" as const };
    const previousCeiling = process.env.OPERATOR_AUTONOMY_CEILING;
    const previousOptIn = process.env.AUTONOMY_ALLOW_OWNER_LEVEL;
    process.env.OPERATOR_AUTONOMY_CEILING = "5";
    process.env.AUTONOMY_ALLOW_OWNER_LEVEL = "true";
    try {
      const granted = await service.create({ text: "run everything", autonomyLevel: 5 }, owner);
      expect(granted.autonomyLevel).toBe(5);

      process.env.AUTONOMY_ALLOW_OWNER_LEVEL = "false";
      const refused = await service.create({ text: "run everything", autonomyLevel: 5 }, owner);
      expect(refused.autonomyLevel).toBe(4);
    } finally {
      if (previousCeiling === undefined) delete process.env.OPERATOR_AUTONOMY_CEILING;
      else process.env.OPERATOR_AUTONOMY_CEILING = previousCeiling;
      if (previousOptIn === undefined) delete process.env.AUTONOMY_ALLOW_OWNER_LEVEL;
      else process.env.AUTONOMY_ALLOW_OWNER_LEVEL = previousOptIn;
    }
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

  it("list embeds the full plan tree + audit trail for the Command Center", async () => {
    const { db } = makeFakeDb();
    const service = new BossService(db);
    await service.create({ text: "analyze revenue" });
    const listed = await service.list();
    expect(listed).toHaveLength(1);
    const row = listed[0];
    expect(row.plan).not.toBeNull();
    const plan = row.plan!;
    expect(Array.isArray(plan.tasks)).toBe(true);
    const firstTask = plan.tasks[0];
    expect(Array.isArray(firstTask.actions)).toBe(true);
    expect(firstTask.actions[0]).toMatchObject({ status: "proposed", permissionResult: expect.stringMatching(/granted|denied/) });
    expect(Array.isArray(row.auditLogs)).toBe(true);
    expect(row.auditLogs.length).toBeGreaterThan(0);
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

    await service.update(created.id, { autonomyLevel: 1 });

    const added = rows.bossAuditLog.slice(auditRef);
    const updatedVerb = added.find((l) => l.verb === "updated");
    expect(updatedVerb).toBeDefined();
    expect(updatedVerb!.detail).toEqual({ autonomyLevel: 1 });
    expect((rows.bossCommand.find((c) => c.id === created.id)?.status as string) ?? "").toBe("planned");
  });

  it("refuses to raise a stored command's autonomy above the server ceiling", async () => {
    const { db, rows } = makeFakeDb();
    const service = new BossService(db);
    const created = await service.create({ text: "report revenue" });

    // PATCH must not be an escalation route around the ceiling.
    const updated = await service.update(created.id, { autonomyLevel: 5 });
    expect(updated.autonomyLevel).toBe(DEFAULT_AUTONOMY_LEVEL);
    expect(rows.bossAuditLog.some((l) => l.verb === "autonomy_clamped")).toBe(true);
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