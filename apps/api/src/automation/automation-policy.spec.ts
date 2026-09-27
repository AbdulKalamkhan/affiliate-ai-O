import {
  DEFAULT_MAX_ATTEMPTS,
  JobStatus,
  NonRetryableJobError,
  RETRY_MAX_DELAY_MS,
  applyJitter,
  backoffDelayMs,
  decideFailure,
  isLockStale,
  isTerminalJobStatus,
  jobStatuses,
  validateEnqueue,
} from "./automation-policy";

const NOW = new Date("2026-09-27T10:00:00.000Z");

describe("automation policy", () => {
  describe("backoff", () => {
    it("doubles each attempt", () => {
      expect(backoffDelayMs(1)).toBe(1_000);
      expect(backoffDelayMs(2)).toBe(2_000);
      expect(backoffDelayMs(3)).toBe(4_000);
      expect(backoffDelayMs(4)).toBe(8_000);
    });

    it("returns 0 for a non-positive attempt instead of a negative delay", () => {
      expect(backoffDelayMs(0)).toBe(0);
      expect(backoffDelayMs(-5)).toBe(0);
    });

    it("caps at the maximum delay", () => {
      expect(backoffDelayMs(50)).toBe(RETRY_MAX_DELAY_MS);
    });

    it("does not overflow to Infinity on an absurd attempt number", () => {
      const delay = backoffDelayMs(Number.MAX_SAFE_INTEGER);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBe(RETRY_MAX_DELAY_MS);
    });

    it("applies jitter without ever producing a negative delay", () => {
      expect(applyJitter(1_000, () => 0.5)).toBe(500);
      expect(applyJitter(1_000, () => 1)).toBe(1_000);
      expect(applyJitter(1_000, () => -5)).toBe(0);
    });
  });

  describe("decideFailure", () => {
    it("retries a retryable failure with exponential backoff", () => {
      const decision = decideFailure({
        attempt: 1,
        maxAttempts: 3,
        retryable: true,
        now: NOW,
        error: "provider timeout",
      });
      expect(decision.outcome).toBe("retry");
      expect(decision).toMatchObject({ nextStatus: "queued", attempt: 2, delayMs: 1_000, deadLettered: false });
      if (decision.outcome === "retry") {
        expect(decision.runAt.getTime()).toBe(NOW.getTime() + 1_000);
      }
    });

    it("grows the delay on later attempts", () => {
      const second = decideFailure({ attempt: 2, maxAttempts: 5, retryable: true, now: NOW, error: "x" });
      expect(second).toMatchObject({ delayMs: 2_000, attempt: 3 });
    });

    it("applies injected jitter deterministically", () => {
      const decision = decideFailure({
        attempt: 1,
        maxAttempts: 3,
        retryable: true,
        now: NOW,
        error: "x",
        random: () => 0.25,
      });
      expect(decision).toMatchObject({ delayMs: 250 });
    });

    it("dead-letters a non-retryable failure immediately without burning retries", () => {
      const decision = decideFailure({
        attempt: 1,
        maxAttempts: 5,
        retryable: false,
        now: NOW,
        error: "handler not registered",
      });
      expect(decision.outcome).toBe("dead_letter");
      expect(decision.nextStatus).toBe("dead_letter");
      expect(decision.deadLettered).toBe(true);
      expect(decision.reason).toContain("non-retryable");
      expect(decision.reason).toContain("handler not registered");
    });

    it("dead-letters when the attempt budget is exhausted", () => {
      const decision = decideFailure({
        attempt: 3,
        maxAttempts: 3,
        retryable: true,
        now: NOW,
        error: "still failing",
      });
      expect(decision.outcome).toBe("dead_letter");
      expect(decision.reason).toContain("attempt budget exhausted after 3/3");
    });

    it("treats maxAttempts=1 as a single shot, never a silent retry", () => {
      const decision = decideFailure({
        attempt: 1,
        maxAttempts: 1,
        retryable: true,
        now: NOW,
        error: "one chance only",
      });
      expect(decision.outcome).toBe("dead_letter");
    });

    it("clamps a nonsensical maxAttempts instead of looping forever", () => {
      const decision = decideFailure({
        attempt: 1,
        maxAttempts: 0,
        retryable: true,
        now: NOW,
        error: "x",
      });
      expect(decision.outcome).toBe("dead_letter");
      expect(decision.reason).toContain("1/1");
    });

    it("always produces a human-readable reason for either outcome", () => {
      for (const retryable of [true, false]) {
        const decision = decideFailure({ attempt: 1, maxAttempts: 3, retryable, now: NOW, error: "boom" });
        expect(decision.reason.length).toBeGreaterThan(0);
        expect(decision.reason).toContain("boom");
      }
    });
  });

  describe("state machine", () => {
    it("exposes the declared statuses", () => {
      expect(jobStatuses()).toEqual<JobStatus[]>([
        "queued",
        "running",
        "succeeded",
        "failed",
        "dead_letter",
        "cancelled",
      ]);
    });

    it("marks succeeded, failed, dead_letter and cancelled as terminal", () => {
      expect(isTerminalJobStatus("succeeded")).toBe(true);
      expect(isTerminalJobStatus("failed")).toBe(true);
      expect(isTerminalJobStatus("dead_letter")).toBe(true);
      expect(isTerminalJobStatus("cancelled")).toBe(true);
    });

    it("does not mark queued or running as terminal", () => {
      expect(isTerminalJobStatus("queued")).toBe(false);
      expect(isTerminalJobStatus("running")).toBe(false);
    });

    it("treats an unknown status as non-terminal but never claims it is valid", () => {
      expect(isTerminalJobStatus("probably_done")).toBe(false);
      expect(jobStatuses()).not.toContain("probably_done");
    });
  });

  describe("lock staleness", () => {
    it("treats a missing lock as stale so an orphan job is reclaimed", () => {
      expect(isLockStale(null, NOW)).toBe(true);
    });

    it("keeps a fresh lock alive", () => {
      expect(isLockStale(new Date(NOW.getTime() - 1_000), NOW, 60_000)).toBe(false);
    });

    it("reclaims a lock older than the timeout", () => {
      expect(isLockStale(new Date(NOW.getTime() - 61_000), NOW, 60_000)).toBe(true);
    });
  });

  describe("validateEnqueue", () => {
    it("accepts a minimal valid enqueue", () => {
      expect(validateEnqueue({ handler: "report.daily" })).toEqual([]);
    });

    it("rejects a missing or blank handler", () => {
      expect(validateEnqueue({ handler: "" })).toEqual([
        { code: "HANDLER_REQUIRED", message: "handler is required" },
      ]);
      expect(validateEnqueue({ handler: "   " })[0].code).toBe("HANDLER_REQUIRED");
    });

    it("rejects a non-positive or fractional maxAttempts", () => {
      expect(validateEnqueue({ handler: "h", maxAttempts: 0 })[0].code).toBe("MAX_ATTEMPTS_INVALID");
      expect(validateEnqueue({ handler: "h", maxAttempts: -1 })[0].code).toBe("MAX_ATTEMPTS_INVALID");
      expect(validateEnqueue({ handler: "h", maxAttempts: 1.5 })[0].code).toBe("MAX_ATTEMPTS_INVALID");
      expect(validateEnqueue({ handler: "h", maxAttempts: Number.NaN })[0].code).toBe("MAX_ATTEMPTS_INVALID");
    });

    it("accepts a valid maxAttempts", () => {
      expect(validateEnqueue({ handler: "h", maxAttempts: 5 })).toEqual([]);
    });

    it("rejects an unparseable runAt instead of defaulting to now", () => {
      expect(validateEnqueue({ handler: "h", runAt: "not-a-date" })[0].code).toBe("RUN_AT_INVALID");
    });

    it("accepts a Date and an ISO string for runAt", () => {
      expect(validateEnqueue({ handler: "h", runAt: NOW })).toEqual([]);
      expect(validateEnqueue({ handler: "h", runAt: NOW.toISOString() })).toEqual([]);
    });

    it("rejects a blank idempotency key rather than treating it as unique", () => {
      expect(validateEnqueue({ handler: "h", idempotencyKey: "  " })[0].code).toBe(
        "IDEMPOTENCY_KEY_INVALID",
      );
    });

    it("reports every problem at once rather than only the first", () => {
      const problems = validateEnqueue({ handler: "", maxAttempts: 0, runAt: "nope", idempotencyKey: "" });
      expect(problems.map((p) => p.code)).toEqual([
        "HANDLER_REQUIRED",
        "MAX_ATTEMPTS_INVALID",
        "RUN_AT_INVALID",
        "IDEMPOTENCY_KEY_INVALID",
      ]);
    });
  });

  describe("NonRetryableJobError", () => {
    it("is distinguishable from a transient failure", () => {
      const error = new NonRetryableJobError("unregistered handler");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("NonRetryableJobError");
    });
  });

  it("exposes a default attempt budget of 3", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(3);
  });
});
