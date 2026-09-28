// Server-side autonomy authority (RULE 10: an action must never bypass its
// required autonomy level, and a declared level must never become an authority).
//
// These tests are the regression guard for the audit finding that
// `POST /boss/commands` and `POST /ai/invoke` accepted a caller-declared level
// of 0..5 verbatim, letting any API-key holder self-grant level 5.

import { BadRequestException } from "@nestjs/common";

import {
  AUTONOMY_LEVELS,
  DEFAULT_AUTONOMY_LEVEL,
  OWNER_LEVEL_ENV,
  OWNER_ONLY_AUTONOMY_LEVEL,
  OPERATOR_AUTONOMY_CEILING_ENV,
  assertAutonomyLevel,
  autonomyAuthorityReport,
  configuredOperatorCeiling,
  ownerLevelAllowed,
  resolveEffectiveAutonomy,
} from "./autonomy";

const OWNER = { role: "owner" as const };
const OPERATOR = { role: "operator" as const };
const VIEWER = { role: "viewer" as const };

describe("autonomy authority", () => {
  describe("assertAutonomyLevel", () => {
    it("keeps the documented level set 0..5", () => {
      expect([...AUTONOMY_LEVELS]).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("fails closed to level 2 when nothing is declared", () => {
      expect(assertAutonomyLevel(undefined)).toBe(DEFAULT_AUTONOMY_LEVEL);
      expect(assertAutonomyLevel(null)).toBe(DEFAULT_AUTONOMY_LEVEL);
      expect(DEFAULT_AUTONOMY_LEVEL).toBe(2);
    });

    it("rejects non-integer and out-of-range levels", () => {
      for (const bad of [7, -1, 1.5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => assertAutonomyLevel(bad)).toThrow(BadRequestException);
      }
      expect(() => assertAutonomyLevel(7)).toThrow(/autonomyLevel must be an integer in 0\.\.5/);
    });
  });

  describe("configuredOperatorCeiling", () => {
    it("defaults to the fail-closed level 2 when unset", () => {
      expect(configuredOperatorCeiling({})).toEqual({ level: 2, source: "default_2_locked" });
    });

    it("fails closed to 2 when the configured value is nonsense", () => {
      for (const bad of ["", "   ", "abc", "-1", "9", "2.7"]) {
        const env = { [OPERATOR_AUTONOMY_CEILING_ENV]: bad } as NodeJS.ProcessEnv;
        expect(configuredOperatorCeiling(env).level).toBe(2);
      }
    });

    it("reads a valid configured ceiling", () => {
      const env = { [OPERATOR_AUTONOMY_CEILING_ENV]: "4" } as NodeJS.ProcessEnv;
      expect(configuredOperatorCeiling(env)).toEqual({ level: 4, source: "env" });
    });
  });

  describe("ownerLevelAllowed", () => {
    it("is off unless explicitly enabled", () => {
      expect(ownerLevelAllowed({})).toBe(false);
      expect(ownerLevelAllowed({ [OWNER_LEVEL_ENV]: "false" } as NodeJS.ProcessEnv)).toBe(false);
      expect(ownerLevelAllowed({ [OWNER_LEVEL_ENV]: "yes" } as NodeJS.ProcessEnv)).toBe(false);
      expect(ownerLevelAllowed({ [OWNER_LEVEL_ENV]: "TRUE" } as NodeJS.ProcessEnv)).toBe(true);
    });
  });

  describe("resolveEffectiveAutonomy", () => {
    it("clamps a declared level 5 down to the default ceiling for a non-owner", () => {
      const result = resolveEffectiveAutonomy({ requested: 5, principal: OPERATOR, env: {} });
      expect(result.effective).toBe(2);
      expect(result.requested).toBe(5);
      expect(result.clamped).toBe(true);
      expect(result.ownerLevelRefused).toBe(true);
    });

    it("refuses level 5 for an owner who has not opted in", () => {
      const result = resolveEffectiveAutonomy({ requested: 5, principal: OWNER, env: {} });
      expect(result.effective).toBe(2);
      expect(result.ownerLevelRefused).toBe(true);
    });

    it("grants level 5 only with an owner principal AND the explicit opt-in", () => {
      const env = { [OPERATOR_AUTONOMY_CEILING_ENV]: "5", [OWNER_LEVEL_ENV]: "true" } as NodeJS.ProcessEnv;
      const granted = resolveEffectiveAutonomy({ requested: 5, principal: OWNER, env });
      expect(granted.effective).toBe(OWNER_ONLY_AUTONOMY_LEVEL);
      expect(granted.ownerLevelRefused).toBe(false);
      expect(granted.clamped).toBe(false);

      // Opt-in alone, without the owner role, is still not enough.
      const notOwner = resolveEffectiveAutonomy({ requested: 5, principal: VIEWER, env });
      expect(notOwner.effective).toBe(4);
      expect(notOwner.ownerLevelRefused).toBe(true);
    });

    it("never raises a declared level, only lowers it", () => {
      const env = { [OPERATOR_AUTONOMY_CEILING_ENV]: "3" } as NodeJS.ProcessEnv;
      expect(resolveEffectiveAutonomy({ requested: 1, principal: OWNER, env }).effective).toBe(1);
      expect(resolveEffectiveAutonomy({ requested: 2, principal: OWNER, env }).effective).toBe(2);
      expect(resolveEffectiveAutonomy({ requested: 3, principal: OWNER, env }).effective).toBe(3);
      expect(resolveEffectiveAutonomy({ requested: 4, principal: OWNER, env }).effective).toBe(3);
      expect(resolveEffectiveAutonomy({ requested: 5, principal: OWNER, env }).effective).toBe(3);
    });

    it("keeps a declared level 0 at 0 (a lower request is never overridden)", () => {
      const env = { [OPERATOR_AUTONOMY_CEILING_ENV]: "4" } as NodeJS.ProcessEnv;
      const result = resolveEffectiveAutonomy({ requested: 0, principal: OWNER, env });
      expect(result.effective).toBe(0);
      expect(result.clamped).toBe(false);
    });

    it("fails closed for a request that carries no principal at all", () => {
      const result = resolveEffectiveAutonomy({ requested: 5, principal: null, env: {} });
      expect(result.effective).toBe(2);
      expect(result.ownerLevelRefused).toBe(true);
    });

    it("honours a configured ceiling above the default", () => {
      const env = { [OPERATOR_AUTONOMY_CEILING_ENV]: "3" } as NodeJS.ProcessEnv;
      const result = resolveEffectiveAutonomy({ requested: 3, principal: OWNER, env });
      expect(result.effective).toBe(3);
      expect(result.ceiling).toBe(3);
      expect(result.ceilingSource).toBe("env");
      expect(result.clamped).toBe(false);
    });

    it("still rejects an invalid declared level rather than silently defaulting", () => {
      expect(() => resolveEffectiveAutonomy({ requested: 9, principal: OWNER, env: {} })).toThrow(
        BadRequestException,
      );
    });
  });

  describe("autonomyAuthorityReport", () => {
    it("reports the rule and the state without leaking any secret", () => {
      const report = autonomyAuthorityReport({} as NodeJS.ProcessEnv);
      expect(report.operatorCeiling).toBe(2);
      expect(report.operatorCeilingSource).toBe("default_2_locked");
      expect(report.ownerLevelAvailable).toBe(false);
      expect(report.rule).toMatch(/can only ever LOWER|min\(declared, server ceiling/i);
      expect(JSON.stringify(report)).not.toMatch(/api[_-]?key/i);
    });
  });
});
