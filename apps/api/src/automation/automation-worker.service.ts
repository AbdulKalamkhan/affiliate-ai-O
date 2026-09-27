// Automation worker — the single consumer of the job queue.
//
// HONESTY / SAFETY RULES:
//   1. The worker is OFF unless `AUTOMATION_WORKER_ENABLED=true`. An off worker
//      is reported as `disabled`, never as "idle" or "healthy".
//   2. It is a plain database poller. It does NOT claim to be connected to Redis,
//      BullMQ, n8n or any broker — none of those are connected.
//   3. Graceful shutdown: on SIGTERM/SIGINT Nest calls `onApplicationShutdown`,
//      which stops claiming new work and lets in-flight handlers finish. If the
//      drain deadline passes first, this worker's locks are released and the
//      open attempt rows are closed, so a job is never left falsely `running`.
//   4. A handler that is declared-but-not-implemented dead-letters with an
//      explicit reason instead of reporting a fake success.

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { prisma } from "@ai-os/database";
import { randomUUID } from "node:crypto";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { BossExecutorService } from "../boss/boss-executor.service";
import { AutomationService, LOCK_TIMEOUT_MS, WORKER_ACTOR, type AutomationJobView } from "./automation.service";
import {
  NOT_IMPLEMENTED_HANDLER_REASON,
  automationHandler,
  automationSideEffect,
} from "./automation-job-registry";
import { NonRetryableJobError } from "./automation-policy";

/** Poll cadence. Every loop recovers stale locks first, then claims due work. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_BATCH_SIZE = 5;
/** How long shutdown waits for in-flight handlers before abandoning them. */
export const SHUTDOWN_DRAIN_MS = 10_000;

const isEnabled = (): boolean => process.env.AUTOMATION_WORKER_ENABLED === "true";
const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export interface WorkerStatus {
  enabled: boolean;
  running: boolean;
  workerId: string | null;
  pollIntervalMs: number;
  batchSize: number;
  inFlight: number;
  drained: boolean;
  note: string;
}

@Injectable()
export class AutomationWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AutomationWorkerService.name);

  private workerId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private draining = false;
  private inFlight = 0;
  private lastError: string | null = null;

  constructor(
    @Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient,
    private readonly queue: AutomationService = new AutomationService(),
    private readonly executor: BossExecutorService = new BossExecutorService(),
  ) {}

  // ------------------------------------------------------------- lifecycle

  onApplicationBootstrap(): void {
    if (!isEnabled()) {
      this.logger.log(
        "automation worker DISABLED (set AUTOMATION_WORKER_ENABLED=true to run queued jobs); no broker is connected",
      );
      return;
    }
    this.workerId = `worker-${randomUUID()}`;
    this.running = true;
    this.lastError = null;
    this.logger.log(`automation worker started as ${this.workerId}`);
    this.scheduleNext(0);
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.running) return;
    this.draining = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger.log(
      `automation worker draining (signal=${signal ?? "none"} inFlight=${this.inFlight}); no new jobs will be claimed`,
    );
    const deadline = Date.now() + envInt("AUTOMATION_SHUTDOWN_DRAIN_MS", SHUTDOWN_DRAIN_MS);
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (this.inFlight > 0) {
      // The drain deadline passed, so these handlers are not going to finish.
      // Their locks are released explicitly rather than left to time out: the
      // open attempt is closed as failed and the job goes straight back to
      // `queued`, so another worker can pick it up immediately and no attempt
      // row is left falsely `running`. A crash that kills the process before
      // this runs is still covered by `recoverStaleLocks`.
      const released = await this.queue.releaseWorkerLocks(
        this.workerId ?? WORKER_ACTOR,
        `automation worker shut down with the attempt still in flight after ${SHUTDOWN_DRAIN_MS}ms`,
      );
      this.logger.warn(
        `automation worker abandoned ${this.inFlight} in-flight job(s) after drain timeout; ` +
          `released ${released.length} lock(s) (${released.join(", ") || "none"}) for immediate retry`,
      );
    }
    this.running = false;
    this.logger.log("automation worker stopped");
  }

  status(): WorkerStatus {
    return {
      enabled: isEnabled(),
      running: this.running,
      workerId: this.workerId,
      pollIntervalMs: envInt("AUTOMATION_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS),
      batchSize: envInt("AUTOMATION_BATCH_SIZE", DEFAULT_BATCH_SIZE),
      inFlight: this.inFlight,
      drained: this.draining,
      note: this.lastError
        ? `last loop error: ${this.lastError}`
        : "database-backed worker; no external broker (Redis/BullMQ/n8n) is connected",
    };
  }

  // ------------------------------------------------------------------ loop

  private scheduleNext(delayMs: number): void {
    if (!this.running || this.draining) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, Math.max(0, delayMs));
    // Do not hold the process open purely for a poll timer.
    this.timer.unref?.();
  }

  /** One poll cycle. Exposed so tests and `/automation/worker/run-once` can drive it. */
  async tick(now = new Date()): Promise<{ claimed: number; succeeded: number; retried: number; deadLettered: number }> {
    const counts = { claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 };
    if (this.draining) return counts;
    this.workerId = this.workerId ?? `worker-${randomUUID()}`;
    try {
      // A worker that died mid-run leaves stale locks; reclaim before claiming.
      const recovered = await this.queue.recoverStaleLocks(now, LOCK_TIMEOUT_MS);
      if (recovered.length > 0) {
        this.logger.warn(`recovered ${recovered.length} stale automation lock(s): ${recovered.join(", ")}`);
      }
      const jobs = await this.queue.claimDue(
        this.workerId,
        envInt("AUTOMATION_BATCH_SIZE", DEFAULT_BATCH_SIZE),
        now,
      );
      counts.claimed = jobs.length;
      for (const job of jobs) {
        // Handlers run sequentially inside the tick: the queue is the safety
        // mechanism, and a bounded loop keeps shutdown deterministic.
        const outcome = await this.runJob(job);
        if (outcome === "succeeded") counts.succeeded += 1;
        else if (outcome === "retried") counts.retried += 1;
        else counts.deadLettered += 1;
      }
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`automation worker tick failed: ${this.lastError}`);
    } finally {
      this.scheduleNext(envInt("AUTOMATION_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS));
    }
    return counts;
  }

  // --------------------------------------------------------------- handlers

  private async runJob(job: AutomationJobView): Promise<"succeeded" | "retried" | "dead_lettered"> {
    this.inFlight += 1;
    try {
      const output = await this.execute(job);
      await this.queue.markSucceeded(job.id, output, { workerId: this.workerId ?? WORKER_ACTOR });
      this.logger.log(`automation job ${job.id} (${job.handler}) succeeded on attempt ${job.attemptCount}`);
      return "succeeded";
    } catch (error) {
      // A non-retryable error (unknown or unimplemented handler) is dead-lettered
      // immediately: retrying a rejected capability can only be rejected again.
      const retryable = !(error instanceof NonRetryableJobError);
      const { decision } = await this.queue.markFailed(job.id, error, {
        workerId: this.workerId ?? WORKER_ACTOR,
        retryable,
      });
      if (decision.outcome === "retry") {
        this.logger.warn(
          `automation job ${job.id} (${job.handler}) failed, retry ${decision.attempt} in ${decision.delayMs}ms: ${decision.reason}`,
        );
        return "retried";
      }
      return "dead_lettered";
    } finally {
      this.inFlight -= 1;
    }
  }

  /**
   * Dispatch to a real handler. Every branch is an internal, auditable read or
   * write; anything requiring an external channel is refused here rather than
   * faked.
   */
  private async execute(job: AutomationJobView): Promise<unknown> {
    const definition = automationHandler(job.handler);
    if (!definition) {
      throw new NonRetryableJobError(
        `handler "${job.handler}" is not in the automation handler registry; refusing to run an undeclared capability`,
      );
    }
    if (definition.implementation !== "implemented") {
      throw new NonRetryableJobError(
        `${NOT_IMPLEMENTED_HANDLER_REASON} (handler "${job.handler}", sideEffect=${automationSideEffect(job.handler)})`,
      );
    }

    const payload = (job.payload ?? {}) as Record<string, unknown>;
    switch (job.handler) {
      case "report.daily": {
        // Recompute a summary from recorded rows only. Missing money stays
        // UNKNOWN (null), never coerced to 0.
        const [clicks, links, assets, revenueEvents] = await Promise.all([
          this.client.affiliateLinkClick.count(),
          this.client.affiliateLink.count(),
          this.client.contentAsset.count(),
          this.client.revenueEvent.count(),
        ]);
        return {
          clicks,
          affiliateLinks: links,
          contentAssets: assets,
          revenueEvents,
          source: "recorded_rows_only",
          note: "Counts of recorded rows. No external API was called and no metric was estimated.",
        };
      }
      case "revenue.reconcile": {
        const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
        const pending = await this.client.revenueEvent.findMany({
          where: eventId ? { id: eventId, status: "pending" } : { status: "pending" },
          orderBy: { occurredAt: "desc" },
          take: 50,
        });
        return {
          pendingEvents: pending.length,
          reconciled: 0,
          note: "Reconciliation requires verified Owner evidence; nothing is auto-marked verified and no amount was inferred.",
        };
      }
      case "action.execute": {
        const actionId = typeof payload.actionId === "string" ? payload.actionId : null;
        if (!actionId) {
          throw new NonRetryableJobError("action.execute requires payload.actionId");
        }
        // The real Boss executor re-checks autonomy, approval and tool
        // implementation, so queueing an action is never a policy bypass.
        const result = await this.executor.executeAction(actionId, { actor: this.workerId ?? WORKER_ACTOR });
        if (result.status === "failed") {
          throw new Error(result.reason);
        }
        return result;
      }
      default:
        throw new NonRetryableJobError(`no handler implementation for ${job.handler}`);
    }
  }
}
