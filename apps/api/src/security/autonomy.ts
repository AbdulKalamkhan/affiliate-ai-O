// Server-side autonomy authority.
//
// HONESTY/SECURITY CONTRACT
// A DECLARED autonomy level in a request body is a REQUEST, not an authority.
// Before this module existed, `POST /boss/commands` and `POST /ai/invoke` took
// `autonomyLevel` straight from the caller and stored it as-is, so any holder of
// the single API key could declare level 5 and unlock every tool. The automation
// queue already had a real server-side ceiling; the manual operator path did not.
//
// Rules enforced here:
//   1. The effective autonomy level is capped by a SERVER-SIDE ceiling. The
//      ceiling can only ever LOWER the requested level (Math.min), never raise it.
//   2. An absent/invalid ceiling fails CLOSED to the documented default (2).
//   3. Level 5 (controlled autonomous execution) is OWNER-ONLY. It requires
//      BOTH an owner principal AND an explicit server opt-in flag. Neither alone
//      is sufficient, so an API-key owner still cannot self-grant level 5 by
//      editing a request body.
//   4. Resolution is pure and env-injectable, so it is deterministic in tests.
//
// The level ladder itself (16_CEO_OPERATING_MODEL.md) is unchanged:
//   0 observe | 1 recommend | 2 prepare drafts/plans (DEFAULT) |
//   3 limited execution with approval | 4 execute | 5 controlled autonomous.

import { BadRequestException } from "@nestjs/common";

import type { Principal } from "./principal";

export const AUTONOMY_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** Fail-closed default: observe/recommend/prepare. Matches the project mandate. */
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 2;

/** Level 5 is reserved for the Owner and can never be self-declared. */
export const OWNER_ONLY_AUTONOMY_LEVEL: AutonomyLevel = 5;

/** Server-side ceiling for interactive (operator/Boss/AI) requests. */
export const OPERATOR_AUTONOMY_CEILING_ENV = "OPERATOR_AUTONOMY_CEILING";

/** Explicit opt-in that unlocks level 5. Off by default, even for the owner. */
export const OWNER_LEVEL_ENV = "AUTONOMY_ALLOW_OWNER_LEVEL";

export type AutonomyCeilingSource = "env" | "default_2_locked";

/**
 * Validate a caller-supplied level. Kept byte-identical to the pre-existing
 * messages so API consumers and existing tests are unaffected.
 */
export const assertAutonomyLevel = (value: number | undefined | null): AutonomyLevel => {
  if (value === undefined || value === null) return DEFAULT_AUTONOMY_LEVEL;
  if (!Number.isInteger(value) || !(AUTONOMY_LEVELS as readonly number[]).includes(value)) {
    // Rendered as "0..5", not the level set joined with the same separator,
    // which would read as "0..1..2..3..4..5".
    const low = AUTONOMY_LEVELS[0];
    const high = AUTONOMY_LEVELS[AUTONOMY_LEVELS.length - 1];
    throw new BadRequestException(`autonomyLevel must be an integer in ${low}..${high}`);
  }
  return value as AutonomyLevel;
};

/** Parse a level out of config, falling back when absent or nonsense. */
const levelFromEnv = (raw: string | undefined, fallback: AutonomyLevel): AutonomyLevel => {
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < AUTONOMY_LEVELS[0] || floored > AUTONOMY_LEVELS[AUTONOMY_LEVELS.length - 1]) return fallback;
  return floored as AutonomyLevel;
};

export interface ConfiguredCeiling {
  level: AutonomyLevel;
  source: AutonomyCeilingSource;
}

/** The server's own ceiling for interactive requests. Never derived from a request. */
export const configuredOperatorCeiling = (
  env: NodeJS.ProcessEnv = process.env,
): ConfiguredCeiling => {
  const raw = env[OPERATOR_AUTONOMY_CEILING_ENV];
  if (raw === undefined || String(raw).trim() === "") {
    return { level: DEFAULT_AUTONOMY_LEVEL, source: "default_2_locked" };
  }
  return { level: levelFromEnv(raw, DEFAULT_AUTONOMY_LEVEL), source: "env" };
};

/** Whether the deployment has explicitly unlocked level 5. */
export const ownerLevelAllowed = (env: NodeJS.ProcessEnv = process.env): boolean =>
  String(env[OWNER_LEVEL_ENV] ?? "").trim().toLowerCase() === "true";

export interface AutonomyResolution {
  /** What the caller asked for (already validated to 0..5). */
  requested: AutonomyLevel;
  /** The level actually persisted and used for every permission decision. */
  effective: AutonomyLevel;
  ceiling: AutonomyLevel;
  ceilingSource: AutonomyCeilingSource;
  /** True when the request was reduced. Surfaced so it is never silent. */
  clamped: boolean;
  /** True when a level-5 request was refused (non-owner, or no opt-in). */
  ownerLevelRefused: boolean;
}

export interface ResolveAutonomyInput {
  requested: number | undefined | null;
  principal?: Pick<Principal, "role"> | null;
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve the one autonomy level that is actually in force. This is the ONLY
 * function that may produce a level for a plan, an AI invocation or an action.
 */
export const resolveEffectiveAutonomy = (input: ResolveAutonomyInput): AutonomyResolution => {
  const requested = assertAutonomyLevel(input.requested);
  const { level: ceiling, source: ceilingSource } = configuredOperatorCeiling(input.env ?? process.env);
  const env = input.env ?? process.env;

  // Level 5 additionally requires an owner principal AND the opt-in flag, so a
  // declared level can never reach it on its own. When it is refused the request
  // falls back to the highest level below it, still bounded by the ceiling.
  const ownerCapable =
    requested !== OWNER_ONLY_AUTONOMY_LEVEL ||
    (input.principal?.role === "owner" && ownerLevelAllowed(env));
  const ownerLevelRefused = requested === OWNER_ONLY_AUTONOMY_LEVEL && !ownerCapable;

  // Math.min is the whole point: the server can only ever LOWER autonomy.
  // A refused level 5 is additionally held below 5, but never ABOVE the ceiling
  // (a ceiling of 2 must still mean 2, not 4).
  const highestReserved = (OWNER_ONLY_AUTONOMY_LEVEL - 1) as AutonomyLevel;
  const cap = ownerLevelRefused ? Math.min(ceiling, highestReserved) : ceiling;
  const effective = Math.min(requested, cap) as AutonomyLevel;

  return {
    requested,
    effective,
    ceiling,
    ceilingSource,
    clamped: effective !== requested,
    ownerLevelRefused,
  };
};

/** Secret-free authority report for a status/health surface. */
export interface AutonomyAuthorityReport {
  levels: readonly number[];
  defaultLevel: AutonomyLevel;
  operatorCeiling: AutonomyLevel;
  operatorCeilingSource: AutonomyCeilingSource;
  ownerLevel: AutonomyLevel;
  ownerLevelAvailable: boolean;
  rule: string;
}

export const autonomyAuthorityReport = (env: NodeJS.ProcessEnv = process.env): AutonomyAuthorityReport => {
  const { level: ceiling, source } = configuredOperatorCeiling(env);
  return {
    levels: AUTONOMY_LEVELS,
    defaultLevel: DEFAULT_AUTONOMY_LEVEL,
    operatorCeiling: ceiling,
    operatorCeilingSource: source,
    ownerLevel: OWNER_ONLY_AUTONOMY_LEVEL,
    ownerLevelAvailable: ownerLevelAllowed(env),
    rule:
      `effective autonomy = min(declared, server ceiling ${ceiling}); ` +
      `level ${OWNER_ONLY_AUTONOMY_LEVEL} additionally requires an owner principal and ${OWNER_LEVEL_ENV}=true`,
  };
};
