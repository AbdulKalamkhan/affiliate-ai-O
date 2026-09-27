// Automation handler registry.
//
// A job may ONLY run a handler that is registered here. The registry is
// provider-neutral and side-effect-typed, exactly like the Boss tool registry:
// an undeclared capability is refused at enqueue time rather than failing
// mysteriously at 3am in a worker.
//
// `sideEffect` semantics are inherited from the Boss execution policy:
//   none     -> pure read / pure computation
//   internal -> writes inside our own database (auditable, still gated)
//   external -> leaves our system -> ALWAYS requires an explicit Owner approval

export const AUTOMATION_SIDE_EFFECTS = ["none", "internal", "external"] as const;
export type AutomationSideEffect = (typeof AUTOMATION_SIDE_EFFECTS)[number];

export interface AutomationHandlerDefinition {
  /** Stable handler name stored on the job row. */
  name: string;
  description: string;
  sideEffect: AutomationSideEffect;
  /**
   * Autonomy level required to enqueue this job. Mirrors the Boss tool policy so
   * queueing work can never be a way around the autonomy ceiling.
   */
  requiredAutonomyLevel: number;
  /** Human-readable, secret-free. */
  implementation: "implemented" | "not_implemented";
}

const DEFINITIONS: Record<string, AutomationHandlerDefinition> = {
  "report.daily": {
    name: "report.daily",
    description: "Recompute and store the daily platform summary from recorded evidence",
    sideEffect: "internal",
    requiredAutonomyLevel: 1,
    implementation: "implemented",
  },
  "revenue.reconcile": {
    name: "revenue.reconcile",
    description: "Reconcile a pending revenue event against provider evidence",
    sideEffect: "internal",
    requiredAutonomyLevel: 3,
    implementation: "implemented",
  },
  "action.execute": {
    name: "action.execute",
    description: "Execute a Boss action through the full execution policy (autonomy + approval)",
    sideEffect: "internal",
    requiredAutonomyLevel: 1,
    implementation: "implemented",
  },
  "marketplace.sync": {
    name: "marketplace.sync",
    description: "Pull live catalog/inventory from a connected marketplace",
    sideEffect: "external",
    requiredAutonomyLevel: 4,
    implementation: "not_implemented",
  },
};

export const AUTOMATION_HANDLERS: readonly AutomationHandlerDefinition[] = Object.values(DEFINITIONS);

export const isKnownAutomationHandler = (name: string): boolean =>
  Object.prototype.hasOwnProperty.call(DEFINITIONS, name);

export const automationHandler = (name: string): AutomationHandlerDefinition | null =>
  isKnownAutomationHandler(name) ? DEFINITIONS[name] : null;

export const isAutomationHandlerImplemented = (name: string): boolean =>
  automationHandler(name)?.implementation === "implemented";

/** Fail-safe default: an unknown handler is treated as externally side-effecting. */
export const automationSideEffect = (name: string): AutomationSideEffect =>
  automationHandler(name)?.sideEffect ?? "external";

export const listAutomationHandlers = (): AutomationHandlerDefinition[] =>
  [...AUTOMATION_HANDLERS].sort((a, b) => a.name.localeCompare(b.name));

export const NOT_IMPLEMENTED_HANDLER_REASON =
  "handler is declared by the automation architecture but has no implementation in this codebase — external integration not connected";
