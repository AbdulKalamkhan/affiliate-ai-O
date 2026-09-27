// Automation queue — the durable, audited, permission-gated job store.
//
// DESIGN (why a database and not an in-memory array or a fake "connected" Redis):
//   - a job is a row, so a redeploy or crash cannot lose it;
//   - every state change is written with the real reason, so a job is never
//     "probably done" — it is `succeeded`, `failed`, `dead_letter` or `queued`;
//   - every enqueue, claim, success, retry and dead-letter writes an audit row.
//
// IDEMPOTENCY: `(handler, idempotencyKey)` is unique. Re-enqueueing the same
// logical work returns the EXISTING job instead of duplicating it, so a client
// retrying a request can never double-post a publish or double-record money.
//
// PERMISSIONS: enqueueing is permission-gated by the caller's role AND by the
// handler's `requiredAutonomyLevel` versus the current Boss autonomy level. A
// `viewer` can never enqueue anything, and queueing can never become a way
// around the autonomy ceiling that `BossExecutionService` enforces.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@ai-os/database";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import type { Principal } from "../security/principal";
import {
  DEFAULT_MAX_ATTEMPTS,
  decideFailure,
  isLockStale,
  isTerminalJobStatus,
  jobStatuses,
  validateEnqueue,
  type JobStatus,
} from "./automation-policy";
import {
  NOT_IMPLEMENTED_HANDLER_REASON,
  automationHandler,
  automationSideEffect,
  isAutomationHandlerImplemented,
  isKnownAutomationHandler,
  listAutomationHandlers,
} from "./automation-job-registry";

export const WORKER_ACTOR = "automation-worker";
export const QUEUE_ACTOR = "automation-queue";

/** How long a `running` lock may go unrefreshed before it is treated as abandoned. */
export const LOCK_TIMEOUT_MS = 5 * 60_000;

export interface EnqueueInput {
  handler: string;
  payload?: unknown;
  queue?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  runAt?: Date | string;
  actionId?: string;
  commandId?: string;
}
export interface EnqueueResult {
  job: AutomationJobView;
  /** `true` when an existing job was returned instead of a new one. */
  deduplicated: boolean;
  reason: string;
}

export interface AutomationJobView {
  id: string;
  handler: string;
  payload: unknown;
  status: string;
  queue: string;
  idempotencyKey: string | null;
  attemptCount: number;
  maxAttempts: number;
  replayCount: number;
  runAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  output: unknown;
  requestedBy: string | null;
  commandId: string | null;
  actionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  attempts?: unknown[];
}

export interface JobStats {
  byStatus: Record<string, number>;
  total: number;
  deadLetter: number;
  retrying: number;
  /** Queued jobs whose backoff has already elapsed, i.e. runnable right now. */
  dueNow: number;
  oldestQueuedAt: Date | null;
  lockTimeoutMs: number;
  /** The autonomy level the queue is gated at, and where that value comes from. */
  autonomyLevel: number;
  autonomySource: "AUTOMATION_AUTONOMY_LEVEL" | "default_0_locked";
  /** Handlers currently blocked because they exceed the configured autonomy. */
  blockedHandlers: { name: string; requiredAutonomyLevel: number }[];
}

const asJson = (value: unknown): Prisma.InputJsonValue =>
  (value ?? null) as unknown as Prisma.InputJsonValue;

type PrismaAutomationJob = { id: string; queue: string };

/**
 * True when an error is a database unique-constraint violation (Prisma P2002).
 * Matched structurally rather than with `instanceof` so it also recognises the
 * test double's equivalent and any driver-level error carrying the same code.
 */
const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "P2002") return true;
  if (code === "UNIQUE_VIOLATION") return true;
  return /unique|duplicate key/i.test((error as { message?: unknown }).message as string);
};

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  // ------------------------------------------------------------- permissions

  /**
   * Authorization for enqueueing. Returns a decision object instead of throwing
   * so the caller can audit WHY a job was refused.
   */
  private authorize(
    principal: Principal,
    handler: string,
  ): { allowed: true; requiredAutonomy: number } | { allowed: false; denyCode: string; reason: string } {
    if (principal.role === "viewer") {
      return {
        allowed: false,
        denyCode: "PRINCIPAL_ROLE_NOT_ALLOWED",
        reason: `role "${principal.role}" may not enqueue automation jobs`,
      };
    }
    const definition = automationHandler(handler);
    // Unknown handlers are refused BEFORE any autonomy check so an undeclared
    // capability can never be requested at all.
    if (!isKnownAutomationHandler(handler) || !definition) {
      return {
        allowed: false,
        denyCode: "UNKNOWN_HANDLER",
        reason: `handler "${handler}" is not in the automation handler registry`,
      };
    }
    return { allowed: true, requiredAutonomy: definition.requiredAutonomyLevel };
  }

  /**
   * The autonomy level the QUEUE is operating at.
   *
   * It is explicit configuration (`AUTOMATION_AUTONOMY_LEVEL`), NOT inferred
   * from the most recent Boss command: a command is a one-off instruction to
   * plan one action, so treating the newest one as a global ceiling made
   * enqueue refuse every handler in a database that simply had no command yet.
   * Autonomy is a standing permission level, so it is configured as one.
   *
   * Default is 0, meaning the queue is effectively locked until the Owner
   * deliberately raises it — fail-closed, never fail-open.
   */
  private queueAutonomyLevel(): number {
    const raw = Number(process.env.AUTOMATION_AUTONOMY_LEVEL);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  }

  /** Reject enqueue that exceeds the configured queue autonomy level. */
  private async assertAutonomy(handler: string): Promise<void> {
    const definition = automationHandler(handler);
    if (!definition) return;
    const autonomyLevel = this.queueAutonomyLevel();
    if (autonomyLevel < definition.requiredAutonomyLevel) {
      throw new ForbiddenException(
        `handler "${handler}" requires autonomy level ${definition.requiredAutonomyLevel}; ` +
          `the automation queue is configured at autonomy level ${autonomyLevel} ` +
          `(AUTOMATION_AUTONOMY_LEVEL). Enqueue refused.`,
      );
    }
  }

  // ---------------------------------------------------------------- enqueue

  /**
   * Enqueue a job. Returns the existing job (deduplicated) when the same
   * `(handler, idempotencyKey)` already exists.
   */
  async enqueue(input: EnqueueInput, principal?: Principal): Promise<EnqueueResult> {
    const actor = principal?.id ?? QUEUE_ACTOR;
    const problems = validateEnqueue({
      handler: input?.handler ?? "",
      maxAttempts: input?.maxAttempts,
      idempotencyKey: input?.idempotencyKey ?? null,
      runAt: input?.runAt ?? undefined,
    });
    if (problems.length > 0) {
      throw new BadRequestException(
        problems.map((p) => `${p.code}: ${p.message}`).join("; "),
      );
    }

    const handler = input.handler.trim();
    const decision = this.authorize(principal ?? { id: QUEUE_ACTOR, role: "owner", authMethod: "api_key" }, handler);
    if (!decision.allowed) {
      await this.audit(null, "automation_job", handler, "enqueue_denied", actor, {
        handler,
        denyCode: decision.denyCode,
        reason: decision.reason,
        sideEffect: automationSideEffect(handler),
      });
      throw new ForbiddenException(`${decision.denyCode}: ${decision.reason}`);
    }

    // Idempotency: an existing job for the same logical work is returned as-is.
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    const findExisting = async (): Promise<AutomationJobView | null> => {
      if (!idempotencyKey) return null;
      const existing = await this.client.automationJob.findMany({
        where: { handler, idempotencyKey },
        take: 1,
      });
      return (existing[0] as unknown as AutomationJobView) ?? null;
    };
    if (idempotencyKey) {
      const existing = await findExisting();
      if (existing) {
        return {
          job: existing,
          deduplicated: true,
          reason: "idempotency key already queued; existing job returned without duplicating work",
        };
      }
    }

    await this.assertAutonomy(handler);

    const runAt = parseRunAt(input.runAt) ?? new Date();
    let job: PrismaAutomationJob;
    try {
      job = await this.client.automationJob.create({
        data: {
          handler,
          payload: asJson(input.payload),
          status: "queued",
          queue: input.queue?.trim() || "default",
          idempotencyKey,
          attemptCount: 0,
          maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          runAt,
          requestedBy: actor,
          ...(input.actionId ? { actionId: input.actionId } : {}),
          ...(input.commandId ? { commandId: input.commandId } : {}),
        },
      });
    } catch (error) {
      // Two concurrent enqueues of the same (handler, idempotencyKey) can both
      // miss the read above; the database unique index is what actually
      // serialises them, so the loser gets P2002. Returning the winner's job
      // keeps idempotency true under concurrency instead of surfacing a
      // duplicate-key error to a retrying client.
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await findExisting();
        if (existing) {
          await this.audit(input.commandId ?? null, "automation_job", existing.id, "enqueue_deduplicated", actor, {
            handler,
            idempotencyKey,
            reason: "concurrent enqueue lost the (handler, idempotencyKey) unique race; winner's job returned",
          });
          return {
            job: existing,
            deduplicated: true,
            reason: "idempotency key already queued by a concurrent request; existing job returned without duplicating work",
          };
        }
      }
      throw error;
    }

    await this.audit(input.commandId ?? null, "automation_job", job.id as string, "enqueued", actor, {
      handler,
      queue: job.queue,
      runAt,
      sideEffect: automationSideEffect(handler),
      // An unimplemented handler is enqueueable but will dead-letter honestly
      // instead of pretending to run an external integration.
      implementation: isAutomationHandlerImplemented(handler) ? "implemented" : "not_implemented",
      idempotencyKey,
    });

    return {
      job: job as unknown as AutomationJobView,
      deduplicated: false,
      reason: isAutomationHandlerImplemented(handler)
        ? "job queued"
        : `job queued but handler is not implemented: ${NOT_IMPLEMENTED_HANDLER_REASON}`,
    };
  }

  // ------------------------------------------------------------------ claim

  /**
   * Atomically claim up to `limit` due jobs for `workerId`. A job is only
   * claimed when it is `queued` AND its `runAt` has passed; the claim sets
   * `lockedAt`/`lockedBy` so a second worker cannot take the same job.
   */
  async claimDue(workerId: string, limit = 1, now = new Date()): Promise<AutomationJobView[]> {
    const due = await this.client.automationJob.findMany({
      where: { status: "queued" },
      orderBy: { runAt: "asc" },
      take: Math.max(1, limit),
    });
    const claimed: AutomationJobView[] = [];
    for (const candidate of due) {
      const runAt = new Date(candidate.runAt as Date);
      if (runAt.getTime() > now.getTime()) continue;
      // The `status: "queued"` in the update `where` is the compare-and-swap:
      // if another worker claimed it first, the update matches nothing.
      const updated = await this.client.automationJob.update({
        where: { id: candidate.id as string, status: "queued" },
        data: {
          status: "running",
          lockedAt: now,
          lockedBy: workerId,
          startedAt: candidate.startedAt ?? now,
          attemptCount: Number(candidate.attemptCount ?? 0) + 1,
        },
      });
      if (updated) {
        const attempt = await this.client.automationAttempt.create({
          data: {
            jobId: updated.id as string,
            attempt: Number(updated.attemptCount ?? 1),
            status: "running",
            startedAt: now,
          },
        });
        await this.audit(updated.commandId as string | null, "automation_job", updated.id as string, "claimed", workerId, {
          handler: updated.handler,
          attempt: updated.attemptCount,
          attemptId: attempt.id as string,
        });
        claimed.push({ ...(updated as unknown as AutomationJobView), attempts: [attempt] });
      }
    }
    return claimed;
  }

  // ---------------------------------------------------------------- outcome

  /** Mark a claimed job as succeeded and close its attempt. */
  async markSucceeded(
    jobId: string,
    output: unknown,
    opts: { workerId?: string; commandId?: string | null } = {},
  ): Promise<AutomationJobView> {
    const now = new Date();
    const job = await this.client.automationJob.update({
      where: { id: jobId, status: "running" },
      data: {
        status: "succeeded",
        finishedAt: now,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        output: asJson(output),
      },
    });
    if (!job) throw new NotFoundException(`job ${jobId} is not running`);
    await this.closeAttempt(jobId, now, { status: "succeeded", output });
    await this.audit(job.commandId as string | null, "automation_job", jobId, "succeeded", opts.workerId ?? WORKER_ACTOR, {
      handler: job.handler,
      attempt: job.attemptCount,
    });
    return job as unknown as AutomationJobView;
  }

  /**
   * Record a failed attempt and apply the retry/dead-letter policy. A retryable
   * failure re-queues the job with exponential backoff; anything else, or an
   * exhausted attempt budget, dead-letters it with the real reason.
   */
  async markFailed(
    jobId: string,
    error: unknown,
    opts: { workerId?: string; retryable?: boolean; now?: Date; random?: () => number } = {},
  ): Promise<{ job: AutomationJobView; decision: ReturnType<typeof decideFailure> }> {
    const now = opts.now ?? new Date();
    const message = error instanceof Error ? error.message : String(error);
    const current = await this.client.automationJob.findUnique({ where: { id: jobId } });
    if (!current) throw new NotFoundException(`job ${jobId} not found`);
    if (isTerminalJobStatus(String(current.status))) {
      throw new BadRequestException(`job ${jobId} is already ${current.status} and cannot change state`);
    }

    const decision = decideFailure({
      attempt: Number(current.attemptCount ?? 1),
      maxAttempts: Number(current.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
      retryable: opts.retryable ?? true,
      now,
      ...(opts.random ? { random: opts.random } : {}),
      error: message,
    });

    const job = await this.client.automationJob.update({
      where: { id: jobId },
      data: {
        status: decision.nextStatus,
        lastError: message,
        ...(decision.outcome === "retry"
          ? { runAt: decision.runAt, lockedAt: null, lockedBy: null }
          : { finishedAt: now, lockedAt: null, lockedBy: null }),
      },
    });
    if (!job) throw new NotFoundException(`job ${jobId} not found`);

    await this.closeAttempt(jobId, now, { status: "failed", error: message });
    await this.audit(
      job.commandId as string | null,
      "automation_job",
      jobId,
      decision.outcome === "retry" ? "retry_scheduled" : "dead_lettered",
      opts.workerId ?? WORKER_ACTOR,
      {
        handler: job.handler,
        attempt: decision.attempt,
        maxAttempts: job.maxAttempts,
        ...(decision.outcome === "retry" ? { delayMs: decision.delayMs, runAt: decision.runAt } : {}),
        reason: decision.reason,
        error: message,
      },
    );
    if (decision.outcome === "dead_letter") {
      this.logger.error(`automation job ${jobId} (${job.handler}) dead-lettered: ${decision.reason}`);
    }
    return { job: job as unknown as AutomationJobView, decision };
  }

  private async closeAttempt(
    jobId: string,
    finishedAt: Date,
    outcome: { status: string; error?: string; output?: unknown },
  ) {
    const attempts = await this.client.automationAttempt.findMany({
      where: { jobId },
      orderBy: { attempt: "desc" },
      take: 1,
    });
    const attempt = attempts[0];
    if (!attempt) return;
    const startedAt = new Date(attempt.startedAt as Date);
    await this.client.automationAttempt.update({
      where: { id: attempt.id as string },
      data: {
        status: outcome.status,
        finishedAt,
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.output !== undefined ? { output: asJson(outcome.output) } : {}),
      },
    });
  }

  /**
   * Requeue a dead-lettered job after a human reviewed it. The attempt budget is
   * reset and a fresh idempotency epoch is used.
   *
   * The replay key is derived from the JOB ID plus a monotonic `replayCount`, not
   * from the original idempotency key. Deriving it from the original key was two
   * bugs at once: it could collide with another job's already-replayed key (a
   * P2002 unique violation against real Postgres), and because `attemptCount` is
   * reset on every replay it produced the SAME key on every replay. Unique job id
   * + monotonic counter makes the key both unique and distinct per generation.
   */
  async replayDeadLetter(
    jobId: string,
    opts: { maxAttempts?: number; principal: Principal },
  ): Promise<AutomationJobView> {
    const job = await this.client.automationJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`job ${jobId} not found`);
    if (job.status !== "dead_letter") {
      throw new BadRequestException(`job ${jobId} is ${job.status}; only a dead_letter job can be replayed`);
    }
    if (opts.principal.role === "viewer") {
      throw new ForbiddenException("role \"viewer\" may not replay a dead-lettered job");
    }
    const generation = Number(job.replayCount ?? 0) + 1;
    const replayKey = `${jobId}#replay:${generation}`;
    const updated = await this.client.automationJob.update({
      where: { id: jobId },
      data: {
        status: "queued",
        runAt: new Date(),
        attemptCount: 0,
        maxAttempts: opts.maxAttempts ?? Number(job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
        lastError: null,
        finishedAt: null,
        lockedAt: null,
        lockedBy: null,
        idempotencyKey: replayKey,
        replayCount: generation,
      },
    });
    if (!updated) throw new NotFoundException(`job ${jobId} not found`);
    await this.audit(job.commandId as string | null, "automation_job", jobId, "replayed", opts.principal.id, {
      handler: job.handler,
      maxAttempts: updated.maxAttempts,
      replayGeneration: generation,
      idempotencyKey: replayKey,
      previousError: job.lastError,
    });
    return updated as unknown as AutomationJobView;
  }

  // ----------------------------------------------------------------- reads

  async list(opts: { status?: string; queue?: string; limit?: number } = {}): Promise<AutomationJobView[]> {
    if (opts.status && !(jobStatuses() as readonly string[]).includes(opts.status)) {
      throw new BadRequestException(`status must be one of: ${jobStatuses().join(", ")}`);
    }
    const rows = await this.client.automationJob.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.queue ? { queue: opts.queue } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(opts.limit ?? 50, 1), 200),
    });
    return rows as unknown as AutomationJobView[];
  }

  async get(jobId: string): Promise<AutomationJobView> {
    const row = await this.client.automationJob.findMany({ where: { id: jobId }, take: 1 });
    if (!row[0]) throw new NotFoundException(`job ${jobId} not found`);
    return row[0] as unknown as AutomationJobView;
  }

  async attemptsFor(jobId: string): Promise<unknown[]> {
    const rows = await this.client.automationAttempt.findMany({
      where: { jobId },
      orderBy: { attempt: "asc" },
    });
    return rows;
  }

  async deadLetters(limit = 50): Promise<AutomationJobView[]> {
    const rows = await this.client.automationJob.findMany({
      where: { status: "dead_letter" },
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows as unknown as AutomationJobView[];
  }

  /**
   * Recover jobs whose worker died mid-run. A stale `running` lock is NOT
   * evidence of progress, so the job goes back to `queued` for another worker.
   */
  async recoverStaleLocks(now = new Date(), timeoutMs = LOCK_TIMEOUT_MS): Promise<string[]> {
    const running = await this.client.automationJob.findMany({ where: { status: "running" } });
    const recovered: string[] = [];
    for (const job of running) {
      const lockedAt = (job.lockedAt as Date | null) ?? null;
      if (!isLockStale(lockedAt, now, timeoutMs)) continue;
      await this.client.automationJob.update({
        where: { id: job.id as string },
        data: { status: "queued", lockedAt: null, lockedBy: null, runAt: now },
      });
      await this.client.automationAttempt.findMany({ where: { jobId: job.id as string } }).then(async (attempts) => {
        const open = attempts.filter((a) => a.status === "running");
        for (const attempt of open) {
          await this.client.automationAttempt.update({
            where: { id: attempt.id as string },
            data: {
              status: "failed",
              error: "worker lock expired before the attempt reported an outcome",
              finishedAt: now,
            },
          });
        }
      });
      recovered.push(job.id as string);
      await this.audit(job.commandId as string | null, "automation_job", job.id as string, "lock_recovered", WORKER_ACTOR, {
        handler: job.handler,
        lockedAt,
        timeoutMs,
        reason: "stale running lock reclaimed; job requeued",
      });
    }
    return recovered;
  }

  /**
   * Release every job this worker still holds as `running`, so an abandoned
   * in-flight handler is requeued immediately instead of sitting locked until
   * `recoverStaleLocks` eventually times it out.
   *
   * Used by the worker on shutdown after its drain deadline passes. The open
   * attempt is closed as `failed` with an explicit reason so no attempt row is
   * left falsely `running`, and the `status`/`lockedBy` pair in the update
   * `where` is the compare-and-swap: a job another worker has already taken
   * over is left untouched.
   *
   * Returns the released job ids. Returns `[]` when the worker held nothing.
   */
  async releaseWorkerLocks(workerId: string, reason: string, now = new Date()): Promise<string[]> {
    const held = await this.client.automationJob.findMany({ where: { status: "running" } });
    const released: string[] = [];
    for (const job of held) {
      if ((job.lockedBy as string | null) !== workerId) continue;
      const updated = await this.client.automationJob.update({
        where: { id: job.id as string, status: "running", lockedBy: workerId },
        data: { status: "queued", lockedAt: null, lockedBy: null, runAt: now },
      });
      if (!updated) continue;
      const attempts = await this.client.automationAttempt.findMany({ where: { jobId: job.id as string } });
      for (const attempt of attempts.filter((a) => a.status === "running")) {
        await this.client.automationAttempt.update({
          where: { id: attempt.id as string },
          data: { status: "failed", error: reason, finishedAt: now },
        });
      }
      released.push(job.id as string);
      await this.audit(job.commandId as string | null, "automation_job", job.id as string, "lock_released", workerId, {
        handler: job.handler,
        reason,
        attempt: job.attemptCount,
      });
    }
    return released;
  }

  async stats(now = new Date()): Promise<JobStats> {
    const all = await this.client.automationJob.findMany({});
    const byStatus: Record<string, number> = {};
    for (const row of all) {
      const status = String(row.status);
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    // Only jobs that are genuinely runnable right now count as "due"; a job
    // sitting in retry backoff is queued but not yet due, and conflating the two
    // would overstate how much work is waiting.
    const queued = all
      .filter((r) => r.status === "queued")
      .map((r) => new Date(r.runAt as Date).getTime())
      .sort((a, b) => a - b);
    const autonomyLevel = this.queueAutonomyLevel();
    const configured = process.env.AUTOMATION_AUTONOMY_LEVEL;
    return {
      byStatus,
      total: all.length,
      deadLetter: byStatus.dead_letter ?? 0,
      // "retrying" = queued with a prior failed attempt, i.e. awaiting backoff.
      retrying: all.filter((r) => Number(r.attemptCount ?? 0) > 0 && r.status === "queued").length,
      dueNow: queued.filter((runAt) => runAt <= now.getTime()).length,
      oldestQueuedAt: queued.length > 0 ? new Date(queued[0] as number) : null,
      lockTimeoutMs: LOCK_TIMEOUT_MS,
      autonomyLevel,
      autonomySource: configured ? "AUTOMATION_AUTONOMY_LEVEL" : "default_0_locked",
      // Report what is currently blocked instead of letting an enqueue 403 be the
      // only way an operator discovers the ceiling.
      blockedHandlers: listAutomationHandlers()
        .filter((h) => h.requiredAutonomyLevel > autonomyLevel)
        .map((h) => ({ name: h.name, requiredAutonomyLevel: h.requiredAutonomyLevel })),
    };
  }

  async handlers() {
    return {
      handlers: listAutomationHandlers(),
      sideEffectNote:
        "external handlers are declared but not implemented: no marketplace or external channel is connected",
    };
  }

  private async audit(
    commandId: string | null,
    entityType: string,
    entityId: string,
    verb: string,
    actor: string,
    detail?: Prisma.InputJsonValue,
  ) {
    await this.client.bossAuditLog.create({
      data: {
        ...(commandId ? { commandId } : {}),
        entityType,
        entityId,
        verb,
        actor,
        ...(detail ? { detail } : {}),
      },
    });
  }
}

function parseRunAt(value: Date | string | undefined | null): Date | null {
  if (value == null) return null;
  const when = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(when) ? new Date(when) : null;
}

export type { JobStatus };
