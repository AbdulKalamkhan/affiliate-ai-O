import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { CurrentPrincipal, type Principal } from "../security/principal";
import { AutomationService, type EnqueueInput } from "./automation.service";
import { AutomationWorkerService } from "./automation-worker.service";

@Controller("automation")
export class AutomationController {
  constructor(
    private readonly queue: AutomationService,
    private readonly worker: AutomationWorkerService,
  ) {}

  /** Declared handlers and whether they actually exist in this codebase. */
  @Get("handlers")
  handlers() {
    return this.queue.handlers();
  }

  /** Queue health: real counts by status, dead-letter count, worker truthfulness. */
  @Get("status")
  async status() {
    const [stats, worker] = await Promise.all([this.queue.stats(), Promise.resolve(this.worker.status())]);
    return { stats, worker };
  }

  @Get("jobs")
  list(@Query("status") status?: string, @Query("queue") queue?: string, @Query("limit") limit?: string) {
    return this.queue.list({
      ...(status ? { status } : {}),
      ...(queue ? { queue } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  @Get("jobs/dead-letters")
  deadLetters(@Query("limit") limit?: string) {
    return this.queue.deadLetters(limit ? Number(limit) : 50);
  }

  @Get("jobs/:id")
  async get(@Param("id") id: string) {
    const job = await this.queue.get(id);
    return { ...job, attempts: await this.queue.attemptsFor(id) };
  }

  /**
   * Enqueue work. The requester is the AUTHENTICATED principal; a `requestedBy`
   * in the body is ignored so a job can never be attributed to someone else.
   */
  @Post("jobs")
  enqueue(@CurrentPrincipal() principal: Principal, @Body() body: EnqueueInput) {
    // `requestedBy` is stripped from the body: a job's requester is always the
    // authenticated principal, never a self-declared identity.
    const safe: EnqueueInput = { ...(body ?? {}) } as EnqueueInput;
    delete (safe as { requestedBy?: string }).requestedBy;
    return this.queue.enqueue(safe, principal);
  }

  /** Human-reviewed replay of a dead-lettered job. Never an automatic path. */
  @Post("jobs/:id/replay")
  replay(@CurrentPrincipal() principal: Principal, @Param("id") id: string, @Body() body: { maxAttempts?: number }) {
    return this.queue.replayDeadLetter(id, { principal, ...(body?.maxAttempts ? { maxAttempts: body.maxAttempts } : {}) });
  }

  /**
   * Run one poll cycle on demand. Returns the real counts; it does not pretend a
   * background worker is doing work when `AUTOMATION_WORKER_ENABLED` is unset.
   */
  @Post("worker/run-once")
  runOnce() {
    return this.worker.tick();
  }
}
