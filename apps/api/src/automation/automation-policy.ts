// Automation policy — pure, deterministic, no I/O.
//
// Everything about HOW a job should be retried, when it is dead-lettered, and
// which transitions are legal lives here so it can be unit-tested without a
// database, a worker, or a clock (the clock is injected).
//
// HONESTY RULES:
//   - Backoff is computed, never guessed at runtime by sleeping in a loop.
//   - `dead_letter` is a real terminal state with a real reason, not a discard.
//   - A non-retryable failure NEVER burns a retry: it dead-letters immediately,
//     because retrying a rejected permission check or invalid payload can only
//     produce the same rejection.

export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** States a job can never leave. */
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  "succeeded",
  "failed",
  "dead_letter",
  "cancelled",
];

export const isTerminalJobStatus = (status: string): boolean =>
  (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);

export const jobStatuses = (): readonly JobStatus[] => JOB_STATUSES;

/** Default retry budget. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Exponential backoff with a full deterministic jitter-free base schedule.
 * Delay for attempt N (1-based) is BASE * 2^(N-1), capped at MAX.
 * Jitter is applied by the worker via `jitterRatio` so tests stay deterministic.
 */
export const RETRY_BASE_DELAY_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 5 * 60_000;

export const backoffDelayMs = (attempt: number, opts: { baseMs?: number; maxMs?: number } = {}): number => {
  const base = opts.baseMs ?? RETRY_BASE_DELAY_MS;
  const max = opts.maxMs ?? RETRY_MAX_DELAY_MS;
  if (attempt < 1) return 0;
  // Math.pow is clamped before shifting so a huge attempt number cannot overflow
  // into a negative or Infinity delay.
  const exponent = Math.min(attempt - 1, 30);
  const delay = base * Math.pow(2, exponent);
  return Math.min(Math.round(delay), max);
};

/** 0..1. Full jitter, so a restart storm cannot re-synchronise every retry. */
export const applyJitter = (delayMs: number, random: () => number): number =>
  Math.max(0, Math.round(delayMs * random()));

export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}

export interface FailureDecisionInput {
  attempt: number;
  maxAttempts: number;
  retryable: boolean;
  now: Date;
  baseMs?: number;
  maxMs?: number;
  random?: () => number;
  error: string;
}

export type FailureDecision =
  | {
      outcome: "retry";
      nextStatus: "queued";
      attempt: number;
      delayMs: number;
      runAt: Date;
      deadLettered: false;
      reason: string;
    }
  | {
      outcome: "dead_letter";
      nextStatus: "dead_letter";
      attempt: number;
      deadLettered: true;
      reason: string;
    };

/**
 * Decide what happens after a failed attempt: schedule a retry with backoff, or
 * dead-letter the job. A job is dead-lettered when the failure is
 * non-retryable, or when the attempt budget is exhausted.
 */
export const decideFailure = (input: FailureDecisionInput): FailureDecision => {
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts));
  const attempt = Math.max(1, Math.floor(input.attempt));
  const maxDelay = input.maxMs ?? RETRY_MAX_DELAY_MS;

  if (!input.retryable) {
    return {
      outcome: "dead_letter",
      nextStatus: "dead_letter",
      attempt,
      deadLettered: true,
      reason: `non-retryable failure on attempt ${attempt}/${maxAttempts}: ${input.error}`,
    };
  }

  if (attempt >= maxAttempts) {
    return {
      outcome: "dead_letter",
      nextStatus: "dead_letter",
      attempt,
      deadLettered: true,
      reason: `attempt budget exhausted after ${attempt}/${maxAttempts} attempts: ${input.error}`,
    };
  }

  const rawDelay = backoffDelayMs(attempt, { baseMs: input.baseMs, maxMs: maxDelay });
  const delayMs = applyJitter(rawDelay, input.random ?? (() => 1));
  return {
    outcome: "retry",
    nextStatus: "queued",
    attempt: attempt + 1,
    delayMs,
    runAt: new Date(input.now.getTime() + delayMs),
    deadLettered: false,
    reason: `attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms: ${input.error}`,
  };
};

/** A stale `running` lock older than this is treated as abandoned, not alive. */
export const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60_000;

export const isLockStale = (lockedAt: Date | null, now: Date, timeoutMs = DEFAULT_LOCK_TIMEOUT_MS): boolean => {
  if (lockedAt == null) return true;
  return now.getTime() - lockedAt.getTime() > timeoutMs;
};

export interface EnqueueValidation {
  handler: string;
  maxAttempts?: number;
  idempotencyKey?: string | null;
  /** Accepts a Date or an ISO string; an unparseable value is a hard error so a
   *  typo can never be silently reinterpreted as "run immediately". */
  runAt?: Date | string | null;
}

export interface EnqueueProblem {
  code:
    | "HANDLER_REQUIRED"
    | "MAX_ATTEMPTS_INVALID"
    | "RUN_AT_INVALID"
    | "IDEMPOTENCY_KEY_INVALID";
  message: string;
}

/** Validate enqueue input. Returns problems rather than throwing so the caller
 *  decides the transport (HTTP 400 vs. a queue-level rejection). */
export const validateEnqueue = (input: EnqueueValidation): EnqueueProblem[] => {
  const problems: EnqueueProblem[] = [];
  if (typeof input.handler !== "string" || input.handler.trim().length === 0) {
    problems.push({ code: "HANDLER_REQUIRED", message: "handler is required" });
  }
  if (input.maxAttempts !== undefined) {
    if (
      typeof input.maxAttempts !== "number" ||
      !Number.isFinite(input.maxAttempts) ||
      input.maxAttempts < 1 ||
      !Number.isInteger(input.maxAttempts)
    ) {
      problems.push({
        code: "MAX_ATTEMPTS_INVALID",
        message: "maxAttempts must be a positive integer",
      });
    }
  }
  if (input.runAt !== undefined && input.runAt !== null) {
    const when =
      input.runAt instanceof Date ? input.runAt.getTime() : Date.parse(String(input.runAt));
    if (!Number.isFinite(when)) {
      problems.push({ code: "RUN_AT_INVALID", message: "runAt must be a valid date or ISO timestamp" });
    }
  }
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length === 0) {
      problems.push({
        code: "IDEMPOTENCY_KEY_INVALID",
        message: "idempotencyKey must be a non-empty string when provided",
      });
    }
  }
  return problems;
};
