import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { Prisma } from "@ai-os/database";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import {
  NOT_IMPLEMENTED_REASON,
  isKnownTool,
  isImplemented,
  sideEffectOf,
  toolDefinition,
} from "./boss-tool-registry";
import {
  actionStatuses,
  type ActionStatus,
  type DenyCode,
  type PolicyDecision,
  evaluateExecutionPolicy,
  isTerminal,
} from "./boss-execution-policy";
import type { BossToolInput, BossToolName } from "./boss-tools";
import { classifyIntent, generatePlan } from "./boss-plan-generator";

export const EXECUTOR_ACTOR = "executor";

export interface ExecuteActionResult {
  actionId: string;
  tool: string;
  status: ActionStatus | string;
  executed: boolean;
  reason: string;
  denyCode?: DenyCode;
  toolCallId?: string;
  output?: unknown;
}

type Ctx = {
  action: {
    id: string;
    tool: string;
    input: unknown;
    status: string;
    autonomyLevel: number;
    requiredAutonomy: number;
    permissionResult: string;
    taskId: string;
    task?: { plan?: { commandId?: string | null } };
  };
  commandId: string | null;
};

@Injectable()
export class BossExecutorService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  // ---------------------------------------------------------------- helpers

  private async loadAction(actionId: string): Promise<Ctx> {
    const row = await this.client.bossAction.findUnique({
      where: { id: actionId },
      include: { task: { include: { plan: true } } },
    });
    if (!row) {
      throw new NotFoundException(`boss action ${actionId} not found`);
    }
    const action = row as unknown as Ctx["action"];
    return { action, commandId: action.task?.plan?.commandId ?? null };
  }

  private async audit(
    commandId: string | null,
    entityType: string,
    entityId: string,
    verb: string,
    actor: string,
    detail?: Prisma.InputJsonValue,
  ) {
    await this.client.bossAuditLog.create({
      data: {
        ...(commandId ? { commandId } : {}),
        entityType,
        entityId,
        verb,
        actor,
        ...(detail ? { detail } : {}),
      },
    });
  }

  private async setActionStatus(id: string, status: ActionStatus) {
    await this.client.bossAction.update({ where: { id }, data: { status } });
  }

  private async currentApproval(actionId: string) {
    const rows = await this.client.bossApproval.findMany({
      where: { actionId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    return rows[0] ?? null;
  }

  // ------------------------------------------------------------- execution

  /**
   * Execute ONE action through the full boundary:
   *   load -> policy -> implementation check -> run -> record -> audit
   *
   * Never fabricates success. Unknown tools, unimplemented tools, autonomy
   * failures and missing approvals all end in an explicit, audited state.
   */
  async executeAction(actionId: string, opts: { actor?: string } = {}): Promise<ExecuteActionResult> {
    const actor = opts.actor ?? EXECUTOR_ACTOR;
    const { action, commandId } = await this.loadAction(actionId);
    const tool = action.tool;

    if (!isKnownTool(tool)) {
      await this.setActionStatus(action.id, "denied");
      await this.audit(commandId, "action", action.id, "execution_denied", actor, {
        tool,
        denyCode: "UNKNOWN_TOOL",
        reason: `tool "${tool}" is not in the typed tool registry`,
      });
      return {
        actionId: action.id,
        tool,
        status: "denied",
        executed: false,
        denyCode: "UNKNOWN_TOOL" as DenyCode,
        reason: `tool "${tool}" is not in the typed tool registry`,
      };
    }

    const contract = toolDefinition(tool)!;
    const sideEffect = sideEffectOf(tool);
    const approval = await this.currentApproval(action.id);

    const decision: PolicyDecision = evaluateExecutionPolicy({
      tool: tool as BossToolName,
      contract,
      autonomyLevel: action.autonomyLevel,
      sideEffect,
      actionStatus: action.status,
      approval: approval
        ? { status: String(approval.status), expiresAt: (approval.expiresAt as Date | null) ?? null }
        : null,
    });

    if (!decision.allowed) {
      await this.setActionStatus(action.id, decision.nextStatus);
      await this.audit(commandId, "action", action.id, "execution_denied", actor, {
        tool,
        denyCode: decision.denyCode,
        requiredAutonomy: action.requiredAutonomy,
        autonomyLevel: action.autonomyLevel,
        sideEffect,
        reason: decision.reason,
      });
      if (decision.nextStatus === "approval_required") {
        const requested = await this.ensureApproval(action.id, commandId, decision.reason, actor);
        return {
          actionId: action.id,
          tool,
          status: "approval_required",
          executed: false,
          denyCode: decision.denyCode,
          reason: decision.reason,
          output: { approvalId: requested.id, approvalStatus: requested.status },
        };
      }
      return {
        actionId: action.id,
        tool,
        status: decision.nextStatus,
        executed: false,
        denyCode: decision.denyCode,
        reason: decision.reason,
      };
    }

    // Policy allowed it. Now: is there actually a handler?
    if (!isImplemented(tool)) {
      const call = await this.client.bossToolCall.create({
        data: {
          actionId: action.id,
          tool,
          input: (action.input ?? {}) as Prisma.InputJsonValue,
          status: "skipped",
          error: NOT_IMPLEMENTED_REASON,
          executedAt: new Date(),
        },
      });
      await this.setActionStatus(action.id, "skipped");
      await this.audit(commandId, "tool_call", call.id as string, "skipped", actor, {
        tool,
        reason: NOT_IMPLEMENTED_REASON,
      });
      return {
        actionId: action.id,
        tool,
        status: "skipped",
        executed: false,
        toolCallId: call.id as string,
        reason: NOT_IMPLEMENTED_REASON,
      };
    }

    const input = (action.input ?? {}) as BossToolInput;
    const startedAt = Date.now();
    const call = await this.client.bossToolCall.create({
      data: {
        actionId: action.id,
        tool,
        input: input as Prisma.InputJsonValue,
        status: "running",
      },
    });

    try {
      const output = await this.runTool(tool, input);
      const durationMs = Date.now() - startedAt;
      await this.client.bossToolCall.update({
        where: { id: call.id as string },
        data: {
          status: "succeeded",
          output: output as unknown as Prisma.InputJsonValue,
          durationMs,
          executedAt: new Date(),
        },
      });
      await this.setActionStatus(action.id, "executed");
      await this.audit(commandId, "tool_call", call.id as string, "succeeded", actor, {
        tool,
        durationMs,
      });
      await this.audit(commandId, "action", action.id, "executed", actor, { tool });
      return {
        actionId: action.id,
        tool,
        status: "executed",
        executed: true,
        toolCallId: call.id as string,
        output,
        reason: "executed within policy",
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : "unknown tool failure";
      await this.client.bossToolCall.update({
        where: { id: call.id as string },
        data: { status: "failed", error: message, durationMs, executedAt: new Date() },
      });
      await this.setActionStatus(action.id, "failed");
      await this.audit(commandId, "tool_call", call.id as string, "failed", actor, { tool, error: message });
      return {
        actionId: action.id,
        tool,
        status: "failed",
        executed: false,
        toolCallId: call.id as string,
        reason: message,
      };
    }
  }

  private async ensureApproval(actionId: string, commandId: string | null, reason: string, actor: string) {
    const existing = await this.currentApproval(actionId);
    if (existing && existing.status === "pending") return existing;
    const created = await this.client.bossApproval.create({
      data: {
        actionId,
        status: "pending",
        reason,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await this.audit(commandId, "approval", created.id as string, "requested", actor, { actionId, reason });
    return created;
  }

  // ------------------------------------------------------------------ tools
  // Real, read-only or internal handlers only. Anything that would need an
  // external channel is declared `not_implemented` in the registry instead.

  /**
   * Handlers are pure functions of (input, deps) so they are unit-testable
   * without a database. Every handler is read-only or an internal draft write.
   */
  private async runTool(tool: string, input: BossToolInput): Promise<unknown> {
    switch (tool) {
      case "plan.generate": {
        const text = typeof input.command === "string" ? input.command : "";
        if (!text) {
          throw new BadRequestException("plan.generate requires a non-empty `command` string");
        }
        const plan = generatePlan(text);
        return { objective: plan.objective, intent: plan.intent, taskCount: plan.tasks.length };
      }
      case "command.clarify": {
        const text = typeof input.command === "string" ? input.command : "";
        const rule = classifyIntent(text);
        const isFallback = rule.keywords.length === 0;
        return {
          needsClarification: isFallback,
          question: isFallback
            ? "Which AI OS area should act on this — content/publishing, research, revenue, or catalog?"
            : null,
          detectedIntent: isFallback ? "clarify" : rule.keywords[0],
        };
      }
      case "opportunity.research": {
        const [total, withEvidence] = await Promise.all([
          this.client.opportunity.count(),
          this.client.opportunityEvidence.count(),
        ]);
        return {
          mode: "internal_evidence_only",
          externalFeedsConnected: false,
          opportunities: total,
          evidenceItems: withEvidence,
          note: "No external research feed is connected; results reflect internal evidence only.",
        };
      }
      case "analytics.read": {
        const [clicks, links, assets, events] = await Promise.all([
          this.client.affiliateLinkClick.count(),
          this.client.affiliateLink.count(),
          this.client.contentAsset.count(),
          this.client.revenueEvent.count(),
        ]);
        return { clicks, links, contentAssets: assets, revenueEvents: events };
      }
      case "asset.catalog": {
        const [links, assets] = await Promise.all([
          this.client.affiliateLink.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
          this.client.contentAsset.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
        ]);
        return {
          affiliateLinks: links.map((l) => ({
            id: l.id,
            campaign: l.campaign,
            destination: l.destination,
          })),
          contentAssets: assets.map((a) => ({
            id: a.id,
            title: a.title,
            published: a.published,
          })),
        };
      }
      case "content.draft": {
        const command = typeof input.command === "string" ? input.command : "";
        if (!command.trim()) {
          throw new BadRequestException("content.draft requires a non-empty `command` string");
        }
        const title = command.trim().slice(0, 100);
        const asset = await this.client.contentAsset.create({
          data: {
            title,
            description: `Draft generated by AI CEO for command: ${command.trim()}`,
            destination: "",
            published: false,
            disclosureAdded: false,
          } as never,
        });
        return { contentAssetId: asset.id, title, published: false, note: "Draft only — not published." };
      }
      case "content.review": {
        const rows = await this.client.contentAsset.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
        return {
          reviewed: rows.length,
          published: rows.filter((r) => r.published).length,
          drafts: rows.filter((r) => !r.published).length,
        };
      }
      case "revenue.reconcile": {
        const pending = await this.client.revenueEvent.findMany({
          where: { status: "pending" },
          orderBy: { occurredAt: "desc" },
          take: 100,
        });
        return {
          pendingEvents: pending.length,
          reconciled: 0,
          note: "Reconciliation requires verified Owner evidence per event; nothing is auto-marked verified.",
        };
      }
      default:
        throw new BadRequestException(`no handler registered for tool ${tool}`);
    }
  }

  // ----------------------------------------------------------------- reads

  async listActions(opts: { commandId?: string; status?: string } = {}) {
    const statuses = actionStatuses() as readonly string[];
    if (opts.status && !statuses.includes(opts.status)) {
      throw new BadRequestException(`status must be one of: ${statuses.join(", ")}`);
    }
    return this.client.bossAction.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.commandId ? { task: { plan: { commandId: opts.commandId } } } : {}),
      } as never,
      orderBy: { createdAt: "desc" },
      include: { approvals: true, toolCalls: { orderBy: { createdAt: "desc" } } },
    });
  }

  async listToolCalls() {
    return this.client.bossToolCall.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getAction(actionId: string) {
    const { action } = await this.loadAction(actionId);
    return this.client.bossAction.findUnique({
      where: { id: action.id },
      include: { approvals: true, toolCalls: { orderBy: { createdAt: "desc" } } },
    });
  }

  /** Actions that are executable right now (policy-allowed, not terminal). */
  async executable() {
    const all = await this.client.bossAction.findMany({ orderBy: { createdAt: "desc" } });
    return all
      .filter((a) => !isTerminal(String(a.status)))
      .map((a) => ({
        id: a.id,
        tool: a.tool,
        status: a.status,
        autonomyLevel: a.autonomyLevel,
        requiredAutonomy: a.requiredAutonomy,
        sideEffect: sideEffectOf(String(a.tool)),
        implementation: isImplemented(String(a.tool)) ? "implemented" : "not_implemented",
      }));
  }
}
