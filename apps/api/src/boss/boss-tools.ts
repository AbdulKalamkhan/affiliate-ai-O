// Typed tool contracts for the Boss / AI CEO (Phase-01).
//
// Each tool declares the minimum "autonomy level" required to use it, following
// the CEO operating model (16_CEO_OPERATING_MODEL.md):
//   level 0 = observe, 1 = recommend, 2 = prepare drafts/plans (DEFAULT on the
//   server), 3 = limited execution with approval, 4 = execute, 5 = controlled
//   autonomous execution.
//
// Phase-01 NEVER executes tools: plans, tasks and actions are stored as
// "proposed" while the permission check result is persisted in BossAction.
// Higher-autonomy tools (e.g. affiliate.publish) are recorded as "denied" at
// the default autonomy (2) — the request still yields an auditable plan.

export type BossToolName =
  | "plan.generate"
  | "command.clarify"
  | "opportunity.research"
  | "analytics.read"
  | "asset.catalog"
  | "content.draft"
  | "content.review"
  | "revenue.reconcile"
  | "affiliate.publish";

export interface BossToolContract {
  name: BossToolName;
  description: string;
  requiredAutonomyLevel: number;
}

export const BOSS_TOOL_REGISTRY: Record<BossToolName, BossToolContract> = {
  "plan.generate": {
    name: "plan.generate",
    description: "Generate a structured, auditable execution plan.",
    requiredAutonomyLevel: 1,
  },
  "command.clarify": {
    name: "command.clarify",
    description: "Ask the Owner for missing details before planning.",
    requiredAutonomyLevel: 1,
  },
  "opportunity.research": {
    name: "opportunity.research",
    description: "Research an opportunity (read-only, no external side effects).",
    requiredAutonomyLevel: 1,
  },
  "analytics.read": {
    name: "analytics.read",
    description: "Read dashboard/analytics data (read-only).",
    requiredAutonomyLevel: 1,
  },
  "asset.catalog": {
    name: "asset.catalog",
    description: "List existing content assets and affiliate links (read-only).",
    requiredAutonomyLevel: 1,
  },
  "content.draft": {
    name: "content.draft",
    description: "Draft pin content for review.",
    requiredAutonomyLevel: 2,
  },
  "content.review": {
    name: "content.review",
    description: "Review drafted content against quality/disclosure rules.",
    requiredAutonomyLevel: 2,
  },
  "revenue.reconcile": {
    name: "revenue.reconcile",
    description: "Reconcile revenue events against verified commission evidence.",
    requiredAutonomyLevel: 3,
  },
  "affiliate.publish": {
    name: "affiliate.publish",
    description: "Publish affiliate content to an external channel (n8n/API).",
    requiredAutonomyLevel: 4,
  },
};

export type BossToolInput = Record<string, string | number | boolean | null>;

export const toolContract = (name: BossToolName): BossToolContract => BOSS_TOOL_REGISTRY[name];

export const canUseTool = (autonomyLevel: number, contract: BossToolContract): boolean =>
  autonomyLevel >= contract.requiredAutonomyLevel;