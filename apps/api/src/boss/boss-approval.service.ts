import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { Prisma } from "@ai-os/database";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { APPROVAL_EXPIRY_HOURS, approvalExpired, type ActionStatus } from "./boss-execution-policy";
import { actionInputHash } from "./approval-scope";

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface ApprovalActionRow {
  id: string;
  tool: string;
  status: string;
  taskId: string;
  input?: unknown;
  version?: number | null;
  task?: { plan?: { commandId?: string | null } };
}

export interface CreateApprovalInput {
  actionId: string;
  reason?: string;
  decidedBy?: string;
  expiresInHours?: number;
  /** The account/marketplace this decision is scoped to, when there is one. */
  targetAccount?: string | null;
  /** The specific object id this decision is scoped to, e.g. a content asset. */
  targetObject?: string | null;
  /** What the approver was shown, recorded verbatim for the audit trail. */
  evidence?: Prisma.InputJsonValue;
}

@Injectable()
export class BossApprovalService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  /** Latest approval for an action, or null. Uses the fake-db shape (array). */
  async latestForAction(actionId: string) {
    const rows = await this.client.bossApproval.findMany({
      where: { actionId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    return rows[0] ?? null;
  }

  /**
   * Request approval for an action. Idempotent per pending state: if a pending
   * approval already exists, it is returned rather than duplicated.
   *
   * The request records what the decision is FOR — the action type, the action
   * version, and a digest of the tool+input — so the policy can reject it later
   * if any of those change. A pending approval that is already stale is not
   * returned as-is: it is replaced, because answering a fresh request with an
   * obsolete consent would be the bug this whole mechanism exists to prevent.
   */
  async requestForAction(actionId: string, reason?: string, expiresInHours = APPROVAL_EXPIRY_HOURS, scope: Partial<CreateApprovalInput> = {}) {
    // Throws NotFound for an unknown action before anything is written.
    const action = await this.getAction(actionId);
    const actionVersion = action.version ?? 1;
    const inputHash = actionInputHash(action.tool, action.input ?? {});
    const existing = await this.latestForAction(actionId);
    if (existing && existing.status === "pending") {
      const staleVersion = existing.actionVersion != null && existing.actionVersion !== actionVersion;
      const staleInput = existing.inputHash != null && existing.inputHash !== inputHash;
      if (!staleVersion && !staleInput) {
        return existing;
      }
      // The pending request was made against a different state of the action.
      // Cancel it rather than letting the Owner approve the wrong thing.
      await this.client.bossApproval.update({
        where: { id: existing.id as string },
        data: { status: "cancelled", reason: "superseded: the action changed after this approval was requested" },
      });
    }
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    return this.client.bossApproval.create({
      data: {
        actionId,
        status: "pending",
        ...(reason ? { reason } : {}),
        expiresAt,
        actionType: action.tool,
        actionVersion,
        inputHash,
        ...(scope.targetAccount ? { targetAccount: scope.targetAccount } : {}),
        ...(scope.targetObject ? { targetObject: scope.targetObject } : {}),
        ...(scope.evidence !== undefined ? { evidence: scope.evidence } : {}),
      },
    });
  }

  private async getAction(id: string): Promise<ApprovalActionRow> {
    const row = await this.client.bossAction.findUnique({
      where: { id },
      include: { task: { include: { plan: true } } },
    });
    if (!row) {
      throw new NotFoundException(`boss action ${id} not found`);
    }
    return row as unknown as ApprovalActionRow;
  }

  private async getApprovalOrThrow(id: string) {
    const rows = await this.client.bossApproval.findMany({
      where: { id },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`boss approval ${id} not found`);
    }
    return row;
  }

  private assertStatus(status: unknown): ApprovalStatus {
    if (typeof status !== "string" || !(APPROVAL_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`status must be one of: ${APPROVAL_STATUSES.join(", ")}`);
    }
    return status as ApprovalStatus;
  }

  /**
   * Owner decision. Transitions are guarded: only a `pending` (or `expired`)
   * approval can be decided, and an expired approval can never be approved
   * retroactively — the owner must request a fresh one.
   */
  async decide(id: string, status: string, opts: { decidedBy?: string; note?: string } = {}) {
    const next = this.assertStatus(status);
    const approval = await this.getApprovalOrThrow(id);
    if (approval.status === next) {
      return approval;
    }
    if (next === "approved") {
      if (approval.status !== "pending" && approval.status !== "expired") {
        throw new ConflictException(
          `approval ${id} is ${approval.status} and cannot transition to approved`,
        );
      }
      if (approval.status === "expired" || approvalExpired(approval as { expiresAt?: Date | null }, new Date())) {
        throw new ConflictException(
          `approval ${id} has expired — request a fresh approval instead of approving an expired one`,
        );
      }
      // Decide-time staleness check. The executor re-checks this too, but
      // refusing here means the Owner is told the moment they try to approve,
      // instead of the approval appearing to succeed and then silently failing
      // at execution.
      const stale = await this.stalenessReason(approval);
      if (stale) {
        throw new ConflictException(`approval ${id} is stale and cannot be approved: ${stale}`);
      }
    }
    if (next === "rejected" && approval.status !== "pending") {
      throw new ConflictException(`approval ${id} is ${approval.status} and cannot be rejected`);
    }
    if (next === "expired" && approval.status !== "pending") {
      throw new ConflictException(`approval ${id} is ${approval.status} and cannot be expired`);
    }

    const decidedBy = opts.decidedBy ?? "owner";
    const detail: Prisma.InputJsonValue = { from: approval.status, to: next, decidedBy };
    if (opts.note) {
      (detail as Record<string, unknown>).note = opts.note;
    }
    const actionId = approval.actionId as string;
    const commandId = await this.commandIdForAction(actionId);
    await this.audit(commandId, "approval", approval.id as string, `${next}`, decidedBy, detail);

    const updated = await this.client.bossApproval.update({
      where: { id },
      data: {
        status: next,
        decidedBy,
        decidedAt: new Date(),
        ...(next === "rejected" && opts.note ? { reason: opts.note } : {}),
      },
    });

    const actionStatus: ActionStatus =
      next === "approved" ? "approved" : next === "rejected" ? "denied" : "proposed";
    await this.client.bossAction.update({
      where: { id: actionId },
      data: { status: actionStatus },
    });

    return updated;
  }

  /**
   * Why this approval no longer describes the action, or null when it still does.
   * A legacy row with no recorded version/hash is treated as current: it was
   * created before the mechanism existed, and inventing a mismatch would refuse
   * an approval that is in fact still valid.
   */
  private async stalenessReason(approval: { actionId: unknown; actionVersion?: unknown; inputHash?: unknown }): Promise<string | null> {
    let action: ApprovalActionRow;
    try {
      action = await this.getAction(approval.actionId as string);
    } catch {
      return "the action it referenced no longer exists";
    }
    const actionVersion = action.version ?? 1;
    const recorded = approval.actionVersion as number | null | undefined;
    if (recorded != null && recorded !== actionVersion) {
      return `it was granted against action version ${recorded} but the action is now version ${actionVersion}`;
    }
    const recordedHash = approval.inputHash as string | null | undefined;
    if (recordedHash != null && recordedHash !== actionInputHash(action.tool, action.input ?? {})) {
      return "the action's input changed after it was requested";
    }
    return null;
  }

  async list(status?: string) {
    if (status !== undefined && status !== null && status !== "") {
      this.assertStatus(status);
      return this.client.bossApproval.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
        include: { action: { include: { task: { include: { plan: true } } } } },
      });
    }
    return this.client.bossApproval.findMany({
      orderBy: { createdAt: "desc" },
      include: { action: { include: { task: { include: { plan: true } } } } },
    });
  }

  async get(id: string) {
    return this.getApprovalOrThrow(id);
  }

  private async commandIdForAction(actionId: string): Promise<string | null> {
    const action = await this.getAction(actionId);
    return action.task?.plan?.commandId ?? null;
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
}
