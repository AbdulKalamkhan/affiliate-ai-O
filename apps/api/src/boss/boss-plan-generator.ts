// Deterministic, rule-based plan generation for the Boss / AI CEO (Phase-01).
//
// Phase-01 gate: a safe Owner command must produce a structured, auditable plan
// WITHOUT external execution. This generator is intentionally deterministic
// (no LLM, no network calls): intent is classified from the command text with a
// small keyword table, and every planned action references a typed tool contract
// from boss-tools.ts. Nothing here executes a tool.

import { BossToolName, BossToolInput, toolContract, canUseTool } from "./boss-tools";

export interface PlannedAction {
  tool: BossToolName;
  input: BossToolInput;
}

export interface PlannedTask {
  title: string;
  actions: PlannedAction[];
}

export interface GeneratedPlan {
  objective: string;
  intent: string;
  tasks: PlannedTask[];
}

type IntentRule = {
  keywords: string[];
  objective: (text: string) => string;
  tasks: () => PlannedTask[];
};

const task = (title: string, actions: PlannedAction[]): PlannedTask => ({ title, actions });
const action = (tool: BossToolName, input: BossToolInput): PlannedAction => ({ tool, input });

const INTENT_RULES: IntentRule[] = [
  {
    keywords: ["publish", "pin", "content", "create a pin", "post", "schedule", "board"],
    objective: (text) => `Create and publish content for: ${text}`,
    tasks: () => [
      task("Draft pin content", [
        action("content.draft", { command: null }),
        action("content.review", { quality: true, disclosure: true }),
      ]),
      task("Approve and publish", [
        action("affiliate.publish", { channel: "PINTEREST", external: true }),
      ]),
    ],
  },
  {
    keywords: ["research", "opportunity", "find", "analyse", "analyze", "trend", "niche"],
    objective: (text) => `Research opportunities for: ${text}`,
    tasks: () => [
      task("Research and evaluate", [
        action("opportunity.research", { intent: "research", depth: "high" }),
      ]),
      task("Summarise findings", [
        action("plan.generate", { output: "brief" }),
      ]),
    ],
  },
  {
    keywords: ["revenue", "commission", "report", "reconcile", "earnings", "profit", "sales"],
    objective: (text) => `Review and reconcile revenue for: ${text}`,
    tasks: () => [
      task("Review analytics", [
        action("analytics.read", { scope: "revenue", onlyVerified: true }),
      ]),
      task("Reconcile against evidence", [
        action("revenue.reconcile", { requireVerifiedEvidence: true }),
      ]),
    ],
  },
  {
    keywords: ["asset", "catalog", "list", "inventory", "links", "library"],
    objective: (text) => `Review asset catalog for: ${text}`,
    tasks: () => [
      task("Catalog existing items", [
        action("asset.catalog", { includeLinks: true, includeAssets: true }),
      ]),
    ],
  },
];

const FALLBACK_INTENT: IntentRule = {
  keywords: [],
  objective: (text) => `Clarify and plan: ${text}`,
  tasks: () => [
    task("Clarify the request", [action("command.clarify", { command: null })]),
    task("Generate an auditable plan", [action("plan.generate", { output: "structured" })]),
  ],
};

export const classifyIntent = (text: string): IntentRule =>
  INTENT_RULES.find((rule) => rule.keywords.some((keyword) => text.toLowerCase().includes(keyword))) ??
  FALLBACK_INTENT;

/** Deterministic plan generation — produces structured tasks referencing typed tools. */
export const generatePlan = (text: string): GeneratedPlan => {
  const rule = classifyIntent(text.trim());
  return {
    objective: rule.objective(text.trim()),
    intent: rule === FALLBACK_INTENT ? "clarify" : rule.keywords[0],
    tasks: rule.tasks(),
  };
};

/** Permission decision for a planned action at a given autonomy level. */
export const evaluatePermission = (
  tool: BossToolName,
  autonomyLevel: number,
): { granted: boolean; requiredAutonomy: number; autonomyLevel: number; tool: string } => {
  const contract = toolContract(tool);
  return {
    tool,
    autonomyLevel,
    requiredAutonomy: contract.requiredAutonomyLevel,
    granted: canUseTool(autonomyLevel, contract),
  };
};

// Re-export as a convenience for service usage.
export { canUseTool, toolContract };

export type { BossToolName, BossToolInput };