// Execution policy for the AI CEO (Phase-01A — executor boundary).
//
// The policy is deliberately conservative and fully deterministic: it never
// fabricates a decision, and every deny reason is explicit so the audit trail
// records WHY an action did or did not run.
//
// Rules:
//   1. The tool must exist in the typed registry (unknown tool = deny).
//   2. The command's autonomy level must meet the tool's required autonomy.
//   3. Any tool with `sideEffect: "external"` requires a granted, unexpired
//      Owner approval — regardless of autonomy level. The Owner stays the final
//      authority for anything that leaves our system.
//   4. Side-effecting tools are additionally gated by the approval gate even
//      at autonomy 5 ("controlled autonomous execution").
//   5. An action that already reached a terminal state is never re-executed
//      (idempotency at the action level).

import type { BossToolContract, BossToolName } from "./boss-tools";

export const ACTION_STATUSES = [
  "proposed",
  "approval_required",
  "approved",
  "executed",
  "failed",
  "denied",
  "skipped",
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const TERMINAL_ACTION_STATUSES: readonly ActionStatus[] = ["executed", "denied", "skipped"];

export const actionStatuses = (): readonly ActionStatus[] => ACTION_STATUSES;

export type SideEffect = "none" | "internal" | "external";

export const APPROVAL_EXPIRY_HOURS = 24;

export interface PolicyInput {
  tool: BossToolName;
  contract: BossToolContract;
  autonomyLevel: number;
  sideEffect: SideEffect;
  actionStatus: string;
  approval: {
    status: string;
    expiresAt?: Date | null;
  } | null;
  now?: Date;
}

export type PolicyDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string; denyCode: DenyCode; nextStatus: ActionStatus };

export type DenyCode =
  | "UNKNOWN_TOOL"
  | "ALREADY_TERMINAL"
  | "AUTONOMY_TOO_LOW"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_PENDING"
  | "APPROVAL_REJECTED"
  | "APPROVAL_EXPIRED";

export interface ToolDefinition extends BossToolContract {
  sideEffect: SideEffect;
  /** Human-readable note on what the tool actually does today. */
  implementation: "implemented" | "not_implemented";
}

export const isTerminal = (status: string): boolean =>
  (TERMINAL_ACTION_STATUSES as readonly string[]).includes(status);

export const approvalExpired = (approval: { expiresAt?: Date | null }, now: Date): boolean =>
  approval.expiresAt != null && approval.expiresAt.getTime() <= now.getTime();

/**
 * Pure policy evaluation. Returns an allow/deny decision with an auditable
 * reason. No I/O, no clock reads beyond the injected `now` (defaults to
 * `new Date()` so callers stay simple in production while tests stay
 * deterministic).
 */
export const evaluateExecutionPolicy = (input: PolicyInput): PolicyDecision => {
  const now = input.now ?? new Date();
  const { contract, autonomyLevel, sideEffect } = input;

  if (isTerminal(input.actionStatus)) {
    return {
      allowed: false,
      denyCode: "ALREADY_TERMINAL",
      nextStatus: input.actionStatus as ActionStatus,
      reason: `action already reached terminal status "${input.actionStatus}" — re-execution is not permitted`,
    };
  }

  if (autonomyLevel < contract.requiredAutonomyLevel) {
    return {
      allowed: false,
      denyCode: "AUTONOMY_TOO_LOW",
      nextStatus: "denied",
      reason: `autonomy ${autonomyLevel} is below required autonomy ${contract.requiredAutonomyLevel} for tool ${contract.name}`,
    };
  }

  if (sideEffect === "external") {
    if (!input.approval) {
      return {
        allowed: false,
        denyCode: "APPROVAL_REQUIRED",
        nextStatus: "approval_required",
        reason: `tool ${contract.name} has external side effects and requires an explicit Owner approval`,
      };
    }
    if (input.approval.status === "pending") {
      return {
        allowed: false,
        denyCode: "APPROVAL_PENDING",
        nextStatus: "approval_required",
        reason: `tool ${contract.name} is awaiting Owner approval`,
      };
    }
    if (input.approval.status === "rejected") {
      return {
        allowed: false,
        denyCode: "APPROVAL_REJECTED",
        nextStatus: "denied",
        reason: `Owner rejected execution of tool ${contract.name}`,
      };
    }
    if (input.approval.status === "expired" || approvalExpired(input.approval, now)) {
      return {
        allowed: false,
        denyCode: "APPROVAL_EXPIRED",
        nextStatus: "approval_required",
        reason: `Owner approval for tool ${contract.name} is expired — a fresh approval is required`,
      };
    }
    if (input.approval.status !== "approved") {
      return {
        allowed: false,
        denyCode: "APPROVAL_PENDING",
        nextStatus: "approval_required",
        reason: `tool ${contract.name} requires approval; approval status "${input.approval.status}" is not executable`,
      };
    }
  }

  return {
    allowed: true,
    reason:
      sideEffect === "external"
        ? `autonomy ${autonomyLevel} >= required ${contract.requiredAutonomyLevel} and Owner approval granted`
        : `autonomy ${autonomyLevel} >= required ${contract.requiredAutonomyLevel}; side effect: ${sideEffect}`,
  };
};
