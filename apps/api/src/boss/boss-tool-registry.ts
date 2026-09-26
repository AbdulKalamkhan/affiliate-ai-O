// Phase-01A tool registry: maps each typed tool contract to its real
// implementation status and side-effect classification.
//
// HONESTY CONTRACT (per project rules — never fabricate external success):
//   - `implemented`      -> a real server-side handler exists in this repo.
//   - `not_implemented`  -> the capability is declared by the architecture but
//                          no handler exists yet. The executor refuses to run it
//                          and records WHY. It never returns a fake success.
//
// Side effects:
//   none     -> pure read / pure computation
//   internal -> writes inside our own database (still auditable, still gated)
//   external -> leaves our system (marketplace/publish) -> ALWAYS needs an
//               explicit, unexpired Owner approval, even at autonomy 5.

import type { SideEffect, ToolDefinition } from "./boss-execution-policy";
import { BOSS_TOOL_REGISTRY, type BossToolName } from "./boss-tools";

const DEFINITIONS: Record<BossToolName, { sideEffect: SideEffect; implementation: "implemented" | "not_implemented" }> = {
  "plan.generate": { sideEffect: "none", implementation: "implemented" },
  "command.clarify": { sideEffect: "none", implementation: "implemented" },
  "opportunity.research": { sideEffect: "none", implementation: "implemented" },
  "analytics.read": { sideEffect: "none", implementation: "implemented" },
  "asset.catalog": { sideEffect: "none", implementation: "implemented" },
  "content.draft": { sideEffect: "internal", implementation: "implemented" },
  "content.review": { sideEffect: "none", implementation: "implemented" },
  "revenue.reconcile": { sideEffect: "internal", implementation: "implemented" },
  // Publishing to Pinterest is an EXTERNAL side effect. The n8n/channel adapter
  // does not exist yet, so this tool is honestly not_implemented. When the
  // adapter lands it must stay sideEffect "external" and therefore always
  // require an Owner approval.
  "affiliate.publish": { sideEffect: "external", implementation: "not_implemented" },
};

export const TOOL_DEFINITIONS: Record<BossToolName, ToolDefinition> = Object.fromEntries(
  (Object.keys(BOSS_TOOL_REGISTRY) as BossToolName[]).map((name) => [
    name,
    {
      ...BOSS_TOOL_REGISTRY[name],
      ...DEFINITIONS[name],
    },
  ]),
) as Record<BossToolName, ToolDefinition>;

export const isKnownTool = (name: string): name is BossToolName =>
  Object.prototype.hasOwnProperty.call(TOOL_DEFINITIONS, name);

export const toolDefinition = (name: string): ToolDefinition | null => {
  if (!isKnownTool(name)) return null;
  return TOOL_DEFINITIONS[name];
};

export const sideEffectOf = (name: string): SideEffect => toolDefinition(name)?.sideEffect ?? "external";

export const isImplemented = (name: string): boolean => toolDefinition(name)?.implementation === "implemented";

/** Public, secret-free tool inventory for the Command Center / API. */
export const listToolDefinitions = (): ToolDefinition[] =>
  (Object.keys(TOOL_DEFINITIONS) as BossToolName[])
    .map((name) => TOOL_DEFINITIONS[name])
    .sort((a, b) => a.name.localeCompare(b.name));

export const NOT_IMPLEMENTED_REASON =
  "tool is declared by the AI OS architecture but has no handler in this codebase — external delivery channel not connected";
