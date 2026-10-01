import { BadRequestException, ConflictException } from "@nestjs/common";

import { makeFakeDb } from "../test/fake-db";
import {
  APPROVAL_EXPIRY_HOURS,
  approvalExpired,
  evaluateExecutionPolicy,
  isTerminal,
  type ActionStatus,
} from "./boss-execution-policy";
import { toolContract } from "./boss-tools";
import { listToolDefinitions, sideEffectOf, toolDefinition } from "./boss-tool-registry";
import { BossApprovalService } from "./boss-approval.service";
import { BossExecutorService } from "./boss-executor.service";
import { actionInputHash } from "./approval-scope";

const HOUR = 60 * 60 * 1000;

describe("boss execution policy", () => {
  const now = new Date("2026-09-26T00:00:00.000Z");

  it("allows an internal tool when autonomy is sufficient", () => {
    const decision = evaluateExecutionPolicy({
      tool: "revenue.reconcile",
      contract: toolContract("revenue.reconcile"),
      autonomyLevel: 3,
      sideEffect: "internal",
      actionStatus: "proposed",
      approval: null,
      now,
    });
    expect(decision.allowed).toBe(true);
  });

  it("denies when autonomy is below the tool requirement", () => {
    const decision = evaluateExecutionPolicy({
      tool: "revenue.reconcile",
      contract: toolContract("revenue.reconcile"),
      autonomyLevel: 2,
      sideEffect: "internal",
      actionStatus: "proposed",
      approval: null,
      now,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.denyCode).toBe("AUTONOMY_TOO_LOW");
      expect(decision.nextStatus).toBe("denied");
    }
  });

  it("requires approval for external side effects even at maximum autonomy", () => {
    const decision = evaluateExecutionPolicy({
      tool: "affiliate.publish",
      contract: toolContract("affiliate.publish"),
      autonomyLevel: 5,
      sideEffect: "external",
      actionStatus: "proposed",
      approval: null,
      now,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.denyCode).toBe("APPROVAL_REQUIRED");
      expect(decision.nextStatus).toBe("approval_required");
    }
  });

  it("keeps a pending approval non-executable", () => {
    const decision = evaluateExecutionPolicy({
      tool: "affiliate.publish",
      contract: toolContract("affiliate.publish"),
      autonomyLevel: 5,
      sideEffect: "external",
      actionStatus: "approval_required",
      approval: { status: "pending", expiresAt: new Date(now.getTime() + HOUR) },
      now,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.denyCode).toBe("APPROVAL_PENDING");
    }
  });

  it("denies a rejected approval", () => {
    const decision = evaluateExecutionPolicy({
      tool: "affiliate.publish",
      contract: toolContract("affiliate.publish"),
      autonomyLevel: 5,
      sideEffect: "external",
      actionStatus: "approval_required",
      approval: { status: "rejected" },
      now,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.denyCode).toBe("APPROVAL_REJECTED");
    }
  });

  it("treats an expired approval as not executable", () => {
    const decision = evaluateExecutionPolicy({
      tool: "affiliate.publish",
      contract: toolContract("affiliate.publish"),
      autonomyLevel: 5,
      sideEffect: "external",
      actionStatus: "approved",
      approval: { status: "approved", expiresAt: new Date(now.getTime() - HOUR) },
      now,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.denyCode).toBe("APPROVAL_EXPIRED");
      expect(decision.nextStatus).toBe("approval_required");
    }
  });

  it("allows an external tool once a fresh approval exists", () => {
    const decision = evaluateExecutionPolicy({
      tool: "affiliate.publish",
      contract: toolContract("affiliate.publish"),
      autonomyLevel: 5,
      sideEffect: "external",
      actionStatus: "approval_required",
      approval: { status: "approved", expiresAt: new Date(now.getTime() + HOUR) },
      now,
    });
    expect(decision.allowed).toBe(true);
  });

  it("never re-executes a terminal action", () => {
    const decision = evaluateExecutionPolicy({
      tool: "analytics.read",
      contract: toolContract("analytics.read"),
      autonomyLevel: 5,
      sideEffect: "none",
      actionStatus: "executed",
      approval: null,
      now,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.denyCode).toBe("ALREADY_TERMINAL");
    }
  });

  it("detects expiry and terminal statuses", () => {
    expect(approvalExpired({ expiresAt: new Date(now.getTime() - 1) }, now)).toBe(true);
    expect(approvalExpired({ expiresAt: new Date(now.getTime() + 1) }, now)).toBe(false);
    expect(approvalExpired({}, now)).toBe(false);
    expect(isTerminal("executed")).toBe(true);
    expect(isTerminal("denied")).toBe(true);
    expect(isTerminal("skipped")).toBe(true);
    expect(isTerminal("proposed")).toBe(false);
    expect(isTerminal("approved")).toBe(false);
  });
});

describe("boss tool registry", () => {
  it("marks external tools as requiring approval", () => {
    expect(sideEffectOf("affiliate.publish")).toBe("external");
    expect(sideEffectOf("analytics.read")).toBe("none");
    expect(sideEffectOf("revenue.reconcile")).toBe("internal");
  });

  it("never claims an unimplemented tool is implemented", () => {
    const publish = toolDefinition("affiliate.publish");
    expect(publish?.implementation).toBe("not_implemented");
    expect(publish?.sideEffect).toBe("external");
  });

  it("returns null for an unknown tool and defaults to the safest side effect", () => {
    expect(toolDefinition("does.not.exist")).toBeNull();
    expect(sideEffectOf("does.not.exist")).toBe("external");
  });

  it("exposes every typed contract with a classification", () => {
    const tools = listToolDefinitions();
    expect(tools.length).toBeGreaterThanOrEqual(9);
    for (const tool of tools) {
      expect(["none", "internal", "external"]).toContain(tool.sideEffect);
      expect(["implemented", "not_implemented"]).toContain(tool.implementation);
      expect(tool.requiredAutonomyLevel).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("BossApprovalService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let service: BossApprovalService;
  let actionId: string;

  beforeEach(async () => {
    db = makeFakeDb();
    service = new BossApprovalService(db.db);
    const command = await db.db.bossCommand.create({ data: { text: "publish pin", autonomyLevel: 4 } });
    const plan = await db.db.bossPlan.create({ data: { commandId: command.id, objective: "o" } });
    const task = await db.db.bossTask.create({ data: { planId: plan.id, order: 1, title: "t" } });
    const action = await db.db.bossAction.create({
      data: { taskId: task.id, tool: "affiliate.publish", input: {}, autonomyLevel: 4, requiredAutonomy: 4 },
    });
    actionId = action.id as string;
  });

  it("does not duplicate a pending approval request", async () => {
    const first = await service.requestForAction(actionId, "needs owner");
    const second = await service.requestForAction(actionId, "again");
    expect(second.id).toBe(first.id);
    expect(db.rows.bossApproval).toHaveLength(1);
  });

  it("approves a pending request and moves the action to approved", async () => {
    const approval = await service.requestForAction(actionId);
    await service.decide(approval.id as string, "approved", { decidedBy: "owner" });
    const action = db.rows.bossAction.find((a) => a.id === actionId);
    expect(action?.status).toBe("approved");
  });

  it("rejects a pending request and denies the action", async () => {
    const approval = await service.requestForAction(actionId);
    await service.decide(approval.id as string, "rejected", { decidedBy: "owner", note: "not now" });
    const action = db.rows.bossAction.find((a) => a.id === actionId);
    expect(action?.status).toBe("denied");
  });

  it("refuses to approve an already rejected approval", async () => {
    const approval = await service.requestForAction(actionId);
    await service.decide(approval.id as string, "rejected", { decidedBy: "owner" });
    await expect(service.decide(approval.id as string, "approved")).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses to approve an expired approval", async () => {
    const approval = await service.requestForAction(actionId);
    db.rows.bossApproval[0].expiresAt = new Date(Date.now() - HOUR);
    await expect(service.decide(approval.id as string, "approved")).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects an unknown status", async () => {
    const approval = await service.requestForAction(actionId);
    await expect(service.decide(approval.id as string, "maybe")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("audits the decision with an actor", async () => {
    const approval = await service.requestForAction(actionId);
    await service.decide(approval.id as string, "approved", { decidedBy: "owner" });
    const audit = db.rows.bossAuditLog.find((a) => a.verb === "approved");
    expect(audit).toBeDefined();
    expect(audit?.actor).toBe("owner");
  });

  it("defaults approval expiry to the documented window", () => {
    expect(APPROVAL_EXPIRY_HOURS).toBe(24);
  });
});

describe("approval scoping and staleness", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let service: BossApprovalService;
  let executor: BossExecutorService;
  let actionId: string;

  beforeEach(async () => {
    db = makeFakeDb();
    service = new BossApprovalService(db.db);
    executor = new BossExecutorService(db.db);
    const command = await db.db.bossCommand.create({ data: { text: "publish pin", autonomyLevel: 5 } });
    const plan = await db.db.bossPlan.create({ data: { commandId: command.id, objective: "o" } });
    const task = await db.db.bossTask.create({ data: { planId: plan.id, order: 1, title: "t" } });
    const action = await db.db.bossAction.create({
      data: { taskId: task.id, tool: "affiliate.publish", input: { pin: "a" }, autonomyLevel: 5, requiredAutonomy: 4 },
    });
    actionId = action.id as string;
  });

  it("records what the decision is for: type, version, input digest and scope", async () => {
    const approval = await service.requestForAction(actionId, "needs owner", undefined, {
      targetAccount: "AMAZON_SELLER",
      targetObject: "asset-42",
      evidence: { shownToOwner: "publish pin a to board 3" },
    });
    expect(approval.actionType).toBe("affiliate.publish");
    expect(approval.actionVersion).toBe(1);
    expect(approval.inputHash).toBe(actionInputHash("affiliate.publish", { pin: "a" }));
    expect(approval.targetAccount).toBe("AMAZON_SELLER");
    expect(approval.targetObject).toBe("asset-42");
    expect(approval.evidence).toMatchObject({ shownToOwner: "publish pin a to board 3" });
  });

  it("refuses to approve once the action version has moved on", async () => {
    const approval = await service.requestForAction(actionId);
    await db.db.bossAction.update({ where: { id: actionId }, data: { version: 2 } });
    await expect(service.decide(approval.id as string, "approved")).rejects.toBeInstanceOf(ConflictException);
    expect(db.rows.bossApproval[0].status).toBe("pending");
  });

  it("refuses to approve once the action input has changed", async () => {
    const approval = await service.requestForAction(actionId);
    await db.db.bossAction.update({ where: { id: actionId }, data: { input: { pin: "DIFFERENT" } } });
    await expect(service.decide(approval.id as string, "approved")).rejects.toThrow(/input changed/);
  });

  it("replaces a stale pending request instead of returning it as still valid", async () => {
    const first = await service.requestForAction(actionId);
    await db.db.bossAction.update({ where: { id: actionId }, data: { version: 2 } });
    const second = await service.requestForAction(actionId);
    expect(second.id).not.toBe(first.id);
    expect(second.actionVersion).toBe(2);
    expect(db.rows.bossApproval[0].status).toBe("cancelled");
  });

  it("does not duplicate a still-valid pending request", async () => {
    const first = await service.requestForAction(actionId);
    const second = await service.requestForAction(actionId);
    expect(second.id).toBe(first.id);
  });

  it("auto-rejects a version-mismatched approval at execution time", async () => {
    const approval = await service.requestForAction(actionId);
    await service.decide(approval.id as string, "approved", { decidedBy: "owner" });
    // The action is then modified without re-approval.
    await db.db.bossAction.update({ where: { id: actionId }, data: { version: 7, status: "approved" } });

    const result = await executor.executeAction(actionId);
    expect(result.executed).toBe(false);
    expect(result.denyCode).toBe("APPROVAL_STALE");
    expect(result.reason).toMatch(/action version 1.*now version 7/);
    expect(db.rows.bossToolCall).toHaveLength(0);
  });

  it("auto-rejects an approval whose input digest no longer matches", async () => {
    const approval = await service.requestForAction(actionId);
    await service.decide(approval.id as string, "approved", { decidedBy: "owner" });
    await db.db.bossAction.update({
      where: { id: actionId },
      data: { status: "approved", input: { pin: "something else entirely" } },
    });

    const result = await executor.executeAction(actionId);
    expect(result.executed).toBe(false);
    expect(result.denyCode).toBe("APPROVAL_STALE");
    expect(result.reason).toMatch(/different action input/);
  });

  it("still executes when the version and digest both still match", async () => {
    const approval = await service.requestForAction(actionId);
    await service.decide(approval.id as string, "approved", { decidedBy: "owner" });
    const result = await executor.executeAction(actionId);
    // affiliate.publish is honestly not_implemented, so it must be skipped
    // rather than succeed: a valid approval does not conjure a handler.
    expect(result.status).toBe("skipped");
    expect(db.rows.bossToolCall[0].status).toBe("skipped");
  });

  it("treats a legacy approval with no recorded version as still current", async () => {
    // Rows created before this mechanism existed must not be refused by an
    // invented mismatch.
    await db.db.bossApproval.create({ data: { actionId, status: "approved" } });
    const result = await executor.executeAction(actionId);
    expect(result.status).toBe("skipped");
  });

  it("treats a cancelled approval as not executable", async () => {
    await db.db.bossApproval.create({ data: { actionId, status: "cancelled" } });
    const result = await executor.executeAction(actionId);
    expect(result.executed).toBe(false);
    expect(result.denyCode).toBe("APPROVAL_PENDING");
  });
});

describe("actionInputHash", () => {
  it("is stable across key ordering", () => {
    expect(actionInputHash("t", { a: 1, b: 2 })).toBe(actionInputHash("t", { b: 2, a: 1 }));
  });

  it("changes when any input value changes", () => {
    expect(actionInputHash("t", { a: 1 })).not.toBe(actionInputHash("t", { a: 2 }));
  });

  it("changes when the tool changes even for identical input", () => {
    expect(actionInputHash("t1", { a: 1 })).not.toBe(actionInputHash("t2", { a: 1 }));
  });

  it("treats a missing input and an empty input as the same thing", () => {
    expect(actionInputHash("t", undefined)).toBe(actionInputHash("t", {}));
  });

  it("distinguishes a nested value from its string form", () => {
    expect(actionInputHash("t", { a: [1, 2] })).not.toBe(actionInputHash("t", { a: "1,2" }));
  });
});

describe("BossExecutorService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let executor: BossExecutorService;
  const commandIdFor = async () => {
    const command = await db.db.bossCommand.create({ data: { text: "report revenue" } });
    const plan = await db.db.bossPlan.create({ data: { commandId: command.id, objective: "o" } });
    const task = await db.db.bossTask.create({ data: { planId: plan.id, order: 1, title: "t" } });
    return task.id as string;
  };

  beforeEach(() => {
    db = makeFakeDb();
    executor = new BossExecutorService(db.db);
  });

  it("executes a read-only tool and records a successful tool call", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "analytics.read", input: { scope: "revenue" }, autonomyLevel: 2, requiredAutonomy: 1 },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(true);
    expect(result.status).toBe("executed");
    expect(db.rows.bossToolCall).toHaveLength(1);
    expect(db.rows.bossToolCall[0].status).toBe("succeeded");
  });

  it("denies a tool whose autonomy requirement is not met", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "revenue.reconcile", input: {}, autonomyLevel: 1, requiredAutonomy: 3 },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(false);
    expect(result.denyCode).toBe("AUTONOMY_TOO_LOW");
    expect(db.rows.bossAction.find((a) => a.id === action.id)?.status).toBe("denied");
  });

  it("raises approval_required for an external tool and creates the request", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "affiliate.publish", input: {}, autonomyLevel: 5, requiredAutonomy: 4 },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.denyCode).toBe("APPROVAL_REQUIRED");
    expect(db.rows.bossApproval).toHaveLength(1);
    expect(db.rows.bossAction.find((a) => a.id === action.id)?.status).toBe("approval_required");
  });

  it("marks an unimplemented external tool as skipped, never succeeded", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "affiliate.publish", input: {}, autonomyLevel: 5, requiredAutonomy: 4 },
    });
    await db.db.bossApproval.create({ data: { actionId: action.id, status: "approved" } });
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(false);
    expect(result.status).toBe("skipped");
    expect(db.rows.bossToolCall[0].status).toBe("skipped");
    expect(db.rows.bossAction.find((a) => a.id === action.id)?.status).toBe("skipped");
  });

  it("denies an unknown tool instead of guessing", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "totally.unknown", input: {}, autonomyLevel: 5, requiredAutonomy: 1 },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.denyCode).toBe("UNKNOWN_TOOL");
    expect(db.rows.bossToolCall).toHaveLength(0);
  });

  it("does not re-execute a terminal action", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "analytics.read", input: {}, autonomyLevel: 2, requiredAutonomy: 1, status: "executed" },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.denyCode).toBe("ALREADY_TERMINAL");
    expect(result.executed).toBe(false);
  });

  it("records a failure without claiming success", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "content.draft", input: { command: "" }, autonomyLevel: 2, requiredAutonomy: 2 },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(false);
    expect(result.status).toBe("failed");
    expect(db.rows.bossToolCall[0].status).toBe("failed");
  });

  it("creates a draft asset via content.draft without publishing it", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "content.draft", input: { command: "anklet campaign" }, autonomyLevel: 2, requiredAutonomy: 2 },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(true);
    const assets = db.rows.contentAsset;
    expect(assets).toHaveLength(1);
    expect(assets[0].published).toBe(false);
  });

  it("reconciles nothing and says so", async () => {
    const taskId = await commandIdFor();
    const action = await db.db.bossAction.create({
      data: { taskId, tool: "revenue.reconcile", input: {}, autonomyLevel: 3, requiredAutonomy: 3 },
    });
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(true);
    const output = result.output as { reconciled: number; pendingEvents: number };
    expect(output.reconciled).toBe(0);
  });

  it("rejects an invalid status filter", async () => {
    await expect(executor.listActions({ status: "not-a-status" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists executable actions with implementation truth", async () => {
    const taskId = await commandIdFor();
    await db.db.bossAction.create({
      data: { taskId, tool: "affiliate.publish", input: {}, autonomyLevel: 5, requiredAutonomy: 4 },
    });
    const rows = await executor.executable();
    expect(rows).toHaveLength(1);
    expect(rows[0].implementation).toBe("not_implemented");
    expect(rows[0].sideEffect).toBe("external");
  });

  it("keeps status typing aligned with the policy vocabulary", () => {
    const typed: ActionStatus[] = [
      "proposed",
      "approval_required",
      "approved",
      "executing",
      "executed",
      "failed",
      "denied",
      "skipped",
      "cancelled",
    ];
    expect(typed).toContain("approval_required");
    expect(typed).toContain("executing");
    expect(typed).toContain("cancelled");
  });
});

describe("BossExecutorService concurrent execution", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let executor: BossExecutorService;

  beforeEach(() => {
    db = makeFakeDb();
    executor = new BossExecutorService(db.db);
  });

  const seed = async () => {
    const command = await db.db.bossCommand.create({ data: { text: "report revenue" } });
    const plan = await db.db.bossPlan.create({ data: { commandId: command.id, objective: "o" } });
    const task = await db.db.bossTask.create({ data: { planId: plan.id, order: 1, title: "t" } });
    return db.db.bossAction.create({
      data: { taskId: task.id, tool: "content.draft", input: { command: "x" }, autonomyLevel: 2, requiredAutonomy: 2 },
    });
  };

  it("lets only one of two concurrent executions reach the side effect", async () => {
    // The invariant that matters: a side-effecting tool must not run twice for
    // one action, no matter which guard catches the second caller.
    const action = await seed();
    const [first, second] = await Promise.all([
      executor.executeAction(action.id as string),
      executor.executeAction(action.id as string),
    ]);
    const executed = [first, second].filter((r) => r.executed === true);
    expect(executed).toHaveLength(1);
    expect(db.rows.contentAsset).toHaveLength(1);
  });

  it("claims the action atomically, so a stale observed status loses the compare-and-set", async () => {
    const action = await seed();
    // Both callers observed "proposed" before either wrote: this is exactly the
    // interleaving a blind `update` cannot defend against.
    const claimA = await db.db.bossAction.updateMany({
      where: { id: action.id, status: "proposed" },
      data: { status: "executing" },
    });
    const claimB = await db.db.bossAction.updateMany({
      where: { id: action.id, status: "proposed" },
      data: { status: "executing" },
    });
    expect(claimA.count).toBe(1);
    expect(claimB.count).toBe(0);
  });

  it("denies a re-run while the action is mid-execution", async () => {
    const action = await seed();
    await db.db.bossAction.update({ where: { id: action.id }, data: { status: "executing" } });
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(false);
    expect(result.denyCode).toBe("ALREADY_EXECUTING");
    expect(db.rows.contentAsset).toHaveLength(0);
  });

  it("audits that an execution started and the race it lost", async () => {
    const action = await seed();
    await executor.executeAction(action.id as string);
    const verbs = db.rows.bossAuditLog.map((l) => l.verb as string);
    expect(verbs).toContain("execution_started");
    expect(verbs).toContain("executed");
  });
});

describe("BossExecutorService.cancelAction", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let executor: BossExecutorService;

  beforeEach(() => {
    db = makeFakeDb();
    executor = new BossExecutorService(db.db);
  });

  const seed = async (status: string) => {
    const command = await db.db.bossCommand.create({ data: { text: "x" } });
    const plan = await db.db.bossPlan.create({ data: { commandId: command.id, objective: "o" } });
    const task = await db.db.bossTask.create({ data: { planId: plan.id, order: 1, title: "t" } });
    return db.db.bossAction.create({
      data: { taskId: task.id, tool: "analytics.read", input: {}, autonomyLevel: 2, requiredAutonomy: 1, status },
    });
  };

  it("cancels a proposed action and audits who cancelled it", async () => {
    const action = await seed("proposed");
    const result = await executor.cancelAction(action.id as string, { actor: "api-key-owner", reason: "not needed" });
    expect(result.cancelled).toBe(true);
    expect(db.rows.bossAction.find((a) => a.id === action.id)?.status).toBe("cancelled");
    const audit = db.rows.bossAuditLog.find((l) => l.verb === "cancelled");
    expect(audit?.actor).toBe("api-key-owner");
    expect(audit?.detail).toMatchObject({ reason: "not needed" });
  });

  it("cancels a pending approval so it can never be approved afterwards", async () => {
    const action = await seed("approval_required");
    await db.db.bossApproval.create({ data: { actionId: action.id, status: "pending" } });
    await executor.cancelAction(action.id as string);
    expect(db.rows.bossApproval[0].status).toBe("cancelled");
  });

  it("refuses to cancel a terminal action", async () => {
    const action = await seed("executed");
    const result = await executor.cancelAction(action.id as string);
    expect(result.cancelled).toBe(false);
    expect(result.reason).toMatch(/terminal/);
    expect(db.rows.bossAction.find((a) => a.id === action.id)?.status).toBe("executed");
  });

  it("refuses to cancel an action that is currently executing", async () => {
    const action = await seed("executing");
    const result = await executor.cancelAction(action.id as string);
    expect(result.cancelled).toBe(false);
    expect(result.reason).toMatch(/currently executing/);
    expect(db.rows.bossAction.find((a) => a.id === action.id)?.status).toBe("executing");
  });

  it("treats a cancelled action as terminal and refuses re-execution", async () => {
    const action = await seed("proposed");
    await executor.cancelAction(action.id as string);
    const result = await executor.executeAction(action.id as string);
    expect(result.executed).toBe(false);
    expect(result.denyCode).toBe("ALREADY_TERMINAL");
  });
});
