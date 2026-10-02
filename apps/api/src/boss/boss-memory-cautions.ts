import type { MemoryFailure } from "./boss-memory-reader";

/**
 * PLAN-LEVEL CAUTIONS FROM MEMORY — advisory, bounded, non-authoritative.
 *
 * Memory stays advisory in this increment. A recorded past failure becomes a
 * human-readable reminder on the plan; it does NOT lower autonomy, change a
 * required permission level, alter approval semantics, grant or revoke executor
 * authority, or reject a command. Those are authority decisions and they stay
 * with `resolveEffectiveAutonomy` and `evaluatePermission`.
 *
 * Two properties are deliberate:
 *
 *  - BOUNDED. At most `MEMORY_CAUTION_LIMIT` cautions per plan, and one per
 *    distinct tool, so a plan can never be flooded by memory.
 *  - NO PAYLOAD. Only `memoryId`, `tool` and `observedAt` are read. The stored
 *    memory `value` is never copied into a caution, so a credential or payload
 *    that was recorded in memory cannot leak into a plan.
 *
 * The wording is advisory on purpose. It must never read as "forbidden".
 */
export const MEMORY_CAUTION_LIMIT = 3;

export interface PlanCaution {
  memoryId: string;
  tool: string | null;
  message: string;
}

export interface CautionResult {
  cautions: PlanCaution[];
  /** Failures that were dropped by the bound, for honest reporting. */
  suppressed: number;
}

const MAX_MESSAGE_LENGTH = 240;

/** Fixed template. Deterministic, tool-scoped, and free of stored payloads. */
const cautionMessage = (tool: string | null): string => {
  const subject = tool ? `tool ${tool}` : "this workflow";
  const base = `Previous execution failure recorded for ${subject}; verify input/credential/state assumptions before execution.`;
  return base.length > MAX_MESSAGE_LENGTH ? `${base.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : base;
};

const toolKey = (tool: string | null): string => tool ?? "";

/**
 * Convert recorded failures into at most `MEMORY_CAUTION_LIMIT` deterministic
 * plan-level cautions, one per distinct tool. Input order is preserved (the
 * caller supplies a deterministic order: newest first, id tie-break).
 */
export const buildMemoryCautions = (
  failures: readonly MemoryFailure[],
  limit: number = MEMORY_CAUTION_LIMIT,
): CautionResult => {
  const bound = Math.max(0, Math.min(Math.trunc(limit), MEMORY_CAUTION_LIMIT));
  const cautions: PlanCaution[] = [];
  const seenTools = new Set<string>();
  let suppressed = 0;

  for (const failure of failures) {
    const key = toolKey(failure.tool);
    // A second failure for a tool already cautioned adds no new advice.
    if (seenTools.has(key)) {
      suppressed += 1;
      continue;
    }
    if (cautions.length >= bound) {
      suppressed += 1;
      continue;
    }
    seenTools.add(key);
    cautions.push({
      memoryId: failure.memoryId,
      tool: failure.tool,
      message: cautionMessage(failure.tool),
    });
  }

  return { cautions, suppressed };
};