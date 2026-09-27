import { makeFakeDb } from "../test/fake-db";
import type { Prisma } from "@ai-os/database";
import type { Principal } from "../security/principal";
import { AutomationService } from "./automation.service";
import { AutomationWorkerService } from "./automation-worker.service";
import { BossExecutorService } from "../boss/boss-executor.service";

const OWNER: Principal = { id: "api-key-owner", role: "owner", authMethod: "api_key" };

const setAutonomy = (level: number) => {
  process.env.AUTOMATION_AUTONOMY_LEVEL = String(level);
};

describe("AutomationWorkerService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let queue: AutomationService;
  let worker: AutomationWorkerService;

  beforeEach(() => {
    db = makeFakeDb();
    queue = new AutomationService(db.db);
    worker = new AutomationWorkerService(db.db, queue, new BossExecutorService(db.db));
  });

  afterEach(() => {
    delete process.env.AUTOMATION_WORKER_ENABLED;
    delete process.env.AUTOMATION_AUTONOMY_LEVEL;
    delete process.env.AUTOMATION_SHUTDOWN_DRAIN_MS;
  });

  const jobRow = () => db.rows.automationJob![0]!;
  const auditVerbs = () => db.rows.bossAuditLog!.map((r) => r.verb);

  // ------------------------------------------------------------- truthfulness

  describe("truthfulness", () => {
    it("reports itself as disabled when not enabled, not as idle or healthy", () => {
      delete process.env.AUTOMATION_WORKER_ENABLED;
    delete process.env.AUTOMATION_AUTONOMY_LEVEL;
      const status = worker.status();
      expect(status.enabled).toBe(false);
      expect(status.running).toBe(false);
    });

    it("does not claim a broker connection", () => {
      expect(worker.status().note).toMatch(/no external broker \(Redis\/BullMQ\/n8n\) is connected/);
    });

    it("does not start a poll loop when disabled", () => {
      worker.onApplicationBootstrap();
      expect(worker.status().running).toBe(false);
    });
  });

  // ------------------------------------------------------------------ enabled

  describe("when enabled", () => {
    beforeEach(() => {
      process.env.AUTOMATION_WORKER_ENABLED = "true";
      setAutonomy(3);
    });

    it("reports a real worker id once started", () => {
      worker.onApplicationBootstrap();
      const status = worker.status();
      expect(status.enabled).toBe(true);
      expect(status.running).toBe(true);
      expect(status.workerId).toMatch(/^worker-/);
    });

    it("stops claiming after shutdown even if a tick is requested", async () => {
      await queue.enqueue({ handler: "report.daily" }, OWNER);
      worker.onApplicationBootstrap();
      await worker.onApplicationShutdown("SIGTERM");
      expect(worker.status().running).toBe(false);
      const counts = await worker.tick();
      expect(counts.claimed).toBe(0);
      // The queued job is untouched: shutdown never silently discards work.
      expect(jobRow().status).toBe("queued");
      expect(jobRow().attemptCount).toBe(0);
    });
  });

  // ------------------------------------------------------------------ run once

  describe("tick", () => {
    beforeEach(() => {
      process.env.AUTOMATION_WORKER_ENABLED = "true";
      setAutonomy(3);
    });

    it("does nothing and reports zero when the queue is empty", async () => {
      expect(await worker.tick()).toEqual({ claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 });
    });

    it("executes report.daily from recorded rows and stores the real output", async () => {
      await db.db.affiliateLinkClick.create({ data: { linkId: "l1" } });
      await db.db.affiliateLink.create({
        data: { provider: "amazon-associates", destination: "https://amzn.to/x" },
      });
      const { job } = await queue.enqueue({ handler: "report.daily" }, OWNER);

      const counts = await worker.tick();
      expect(counts).toEqual({ claimed: 1, succeeded: 1, retried: 0, deadLettered: 0 });
      const done = await queue.get(job.id);
      expect(done.status).toBe("succeeded");
      expect(done.output).toMatchObject({ clicks: 1, affiliateLinks: 1, source: "recorded_rows_only" });
    });

    it("never fabricates a metric it did not count", async () => {
      await queue.enqueue({ handler: "report.daily" }, OWNER);
      await worker.tick();
      const output = jobRow().output as { clicks: number; revenueEvents: number };
      expect(output.clicks).toBe(0);
      expect(output.revenueEvents).toBe(0);
    });

    it("does not touch revenue when reconciling: nothing is auto-verified", async () => {
      await db.db.revenueEvent.create({
        data: { provider: "amazon-associates", value: 199, status: "pending" },
      });
      const { job } = await queue.enqueue({ handler: "revenue.reconcile", payload: {} }, OWNER);
      await worker.tick();
      const done = await queue.get(job.id);
      expect(done.status).toBe("succeeded");
      expect(done.output).toMatchObject({ pendingEvents: 1, reconciled: 0 });
      expect(db.rows.revenueEvent![0]!.status).toBe("pending");
    });

    it("scopes reconciliation to one event when given an eventId", async () => {
      await db.db.revenueEvent.create({
        data: { id: "e1", provider: "amazon-associates", value: 199, status: "pending" },
      });
      await db.db.revenueEvent.create({
        data: { id: "e2", provider: "amazon-associates", value: 99, status: "pending" },
      });
      const { job } = await queue.enqueue({ handler: "revenue.reconcile", payload: { eventId: "e1" } }, OWNER);
      await worker.tick();
      expect((await queue.get(job.id)).output).toMatchObject({ pendingEvents: 1 });
    });

    it("writes an audit trail for claim AND success", async () => {
      await queue.enqueue({ handler: "report.daily" }, OWNER);
      await worker.tick();
      const verbs = auditVerbs();
      expect(verbs).toContain("enqueued");
      expect(verbs).toContain("claimed");
      expect(verbs).toContain("succeeded");
    });

    it("honours the runAt backoff: a job waiting on a retry is not claimed early", async () => {
      const { job } = await queue.enqueue({ handler: "report.daily" }, OWNER);
      await queue.claimDue("other-worker", 1);
      await queue.markFailed(job.id, new Error("transient"), { now: new Date(), random: () => 1 });
      // The retry is scheduled 1s out; the fake's runAt is real, so an immediate
      // tick must not claim it.
      const counts = await worker.tick();
      expect(counts.claimed).toBe(0);
      expect((await queue.get(job.id)).status).toBe("queued");
    });
  });

  // ------------------------------------------------------------- dead letters

  describe("declared-but-unimplemented handlers", () => {
    beforeEach(() => {
      process.env.AUTOMATION_WORKER_ENABLED = "true";
      setAutonomy(4);
    });

    it("dead-letters marketplace.sync instead of pretending an external call happened", async () => {
      const { job, reason } = await queue.enqueue({ handler: "marketplace.sync" }, OWNER);
      expect(reason).toMatch(/not implemented/);

      const counts = await worker.tick();
      expect(counts).toEqual({ claimed: 1, succeeded: 0, retried: 0, deadLettered: 1 });

      const dead = await queue.get(job.id);
      expect(dead.status).toBe("dead_letter");
      expect(dead.lastError).toMatch(/no implementation|not implemented/);
      expect(dead.output).toBeNull();
      expect(dead.finishedAt).toBeInstanceOf(Date);
    });

    it("does NOT burn retries on an unimplemented handler", async () => {
      const { job } = await queue.enqueue({ handler: "marketplace.sync", maxAttempts: 5 }, OWNER);
      await worker.tick();
      expect((await queue.get(job.id)).attemptCount).toBe(1);
      expect(auditVerbs()).toContain("dead_lettered");
      expect(auditVerbs()).not.toContain("retry_scheduled");
    });

    it("dead-letters an unregistered handler rather than running it", async () => {
      // Bypass the enqueue gate to prove the worker is independently safe.
      // runAt is set explicitly to an already-due time: the row is inserted
      // directly, so it has no enqueue-time default to inherit.
      const raw = await db.db.automationJob.create({
        data: { handler: "evil.handler", payload: {}, runAt: new Date(Date.now() - 1_000) },
      });
      const counts = await worker.tick();
      expect(counts.deadLettered).toBe(1);
      const dead = await queue.get(raw.id as string);
      expect(dead.status).toBe("dead_letter");
      expect(dead.lastError).toMatch(/not in the automation handler registry/);
    });
  });

  // -------------------------------------------------------------- action.execute

  describe("action.execute", () => {
    beforeEach(() => {
      process.env.AUTOMATION_WORKER_ENABLED = "true";
      setAutonomy(3);
    });

    const seedAction = async (
      tool: string,
      input: Prisma.InputJsonValue,
      autonomyLevel: number,
    ) => {
      const command = await db.db.bossCommand.create({ data: { text: "cmd", autonomyLevel } });
      const plan = await db.db.bossPlan.create({ data: { commandId: command.id as string, objective: "o" } });
      const task = await db.db.bossTask.create({ data: { planId: plan.id as string, order: 1, title: "t" } });
      return db.db.bossAction.create({
        data: {
          taskId: task.id as string,
          tool,
          input,
          autonomyLevel,
          requiredAutonomy: 1,
          status: "approved",
        },
      });
    };

    it("delegates to the real Boss executor and records the real result", async () => {
      const action = await seedAction("analytics.read", { scope: "revenue" }, 3);
      const { job } = await queue.enqueue(
        { handler: "action.execute", payload: { actionId: action.id }, idempotencyKey: "act-1" },
        OWNER,
      );
      const counts = await worker.tick();
      expect(counts.succeeded).toBe(1);
      const done = await queue.get(job.id);
      expect(done.status).toBe("succeeded");
      expect(done.output).toMatchObject({ executed: true, status: "executed" });
    });

    it("re-checks policy in the worker: queueing cannot bypass the autonomy gate", async () => {
      // autonomy 0 action, so the executor denies it even though the job was queued.
      const action = await seedAction("analytics.read", { scope: "revenue" }, 0);
      const { job } = await queue.enqueue(
        { handler: "action.execute", payload: { actionId: action.id } },
        OWNER,
      );
      const counts = await worker.tick();
      const done = await queue.get(job.id);
      expect(done.output).toMatchObject({ executed: false, status: "denied" });
      // A policy denial is a real outcome, not a job failure.
      expect(counts.succeeded).toBe(1);
      expect(done.status).toBe("succeeded");
    });

    it("treats a missing actionId as non-retryable, not a transient failure", async () => {
      const { job } = await queue.enqueue({ handler: "action.execute", payload: {} }, OWNER);
      const counts = await worker.tick();
      expect(counts.deadLettered).toBe(1);
      expect((await queue.get(job.id)).lastError).toMatch(/requires payload\.actionId/);
    });

    it("retries a genuinely failed action instead of dead-lettering on the first error", async () => {
      // content.draft with an empty command is a real, retryable handler failure
      // (the tool throws), not a policy denial.
      const action = await seedAction("content.draft", { command: "" }, 3);
      const { job } = await queue.enqueue(
        { handler: "action.execute", payload: { actionId: action.id }, maxAttempts: 3 },
        OWNER,
      );
      const counts = await worker.tick();
      expect(counts.retried).toBe(1);
      const after = await queue.get(job.id);
      expect(after.status).toBe("queued");
      expect(after.attemptCount).toBe(1);
      expect(after.lastError).toMatch(/non-empty/);
      // Backoff is applied: the retry is scheduled in the future, not now.
      expect(new Date(after.runAt as Date).getTime()).toBeGreaterThan(Date.now());
    });

    it("dead-letters an action that keeps failing until the attempt budget is spent", async () => {
      const action = await seedAction("content.draft", { command: "" }, 3);
      const { job } = await queue.enqueue(
        { handler: "action.execute", payload: { actionId: action.id }, maxAttempts: 1 },
        OWNER,
      );
      const counts = await worker.tick();
      expect(counts.deadLettered).toBe(1);
      const after = await queue.get(job.id);
      expect(after.status).toBe("dead_letter");
      expect(after.lastError).toMatch(/non-empty/);
      expect(auditVerbs()).toContain("dead_lettered");
    });

    it("refuses to re-execute an action that already reached a terminal status", async () => {
      const action = await seedAction("analytics.read", { scope: "revenue" }, 3);
      await db.db.bossAction.update({
        where: { id: action.id as string },
        data: { status: "executed" },
      });
      const { job } = await queue.enqueue(
        { handler: "action.execute", payload: { actionId: action.id } },
        OWNER,
      );
      await worker.tick();
      const done = await queue.get(job.id);
      // The executor denies re-execution and the job records that real outcome.
      expect(done.output).toMatchObject({ executed: false, denyCode: "ALREADY_TERMINAL" });
      expect(done.status).toBe("succeeded");
    });
  });

  // ------------------------------------------------------------------ recovery

  describe("stale lock recovery", () => {
    beforeEach(() => {
      process.env.AUTOMATION_WORKER_ENABLED = "true";
      setAutonomy(3);
    });

    it("reclaims work abandoned by a crashed worker and runs it", async () => {
      const { job } = await queue.enqueue({ handler: "report.daily" }, OWNER);
      await queue.claimDue("dead-worker", 1);
      // Simulate the crash by back-dating the lock past the timeout.
      db.rows.automationJob![0]!.lockedAt = new Date(Date.now() - 10 * 60_000);

      const counts = await worker.tick();
      expect(counts.succeeded).toBe(1);
      const done = await queue.get(job.id);
      expect(done.status).toBe("succeeded");
      expect(done.attemptCount).toBe(2);
      expect(auditVerbs()).toContain("lock_recovered");
    });

    it("does not steal a live worker's job", async () => {
      await queue.enqueue({ handler: "report.daily" }, OWNER);
      await queue.claimDue("live-worker", 1);
      const counts = await worker.tick();
      expect(counts.claimed).toBe(0);
      expect(jobRow().lockedBy).toBe("live-worker");
    });
  });

  // ------------------------------------------------------------------ shutdown

  describe("graceful shutdown", () => {
    beforeEach(() => {
      process.env.AUTOMATION_WORKER_ENABLED = "true";
      setAutonomy(3);
    });

    it("stops the loop and reports drained", async () => {
      worker.onApplicationBootstrap();
      await worker.onApplicationShutdown("SIGTERM");
      expect(worker.status()).toMatchObject({ running: false, drained: true });
    });

    it("is a no-op when the worker was never running", async () => {
      delete process.env.AUTOMATION_WORKER_ENABLED;
    delete process.env.AUTOMATION_AUTONOMY_LEVEL;
      worker.onApplicationBootstrap();
      await expect(worker.onApplicationShutdown("SIGTERM")).resolves.toBeUndefined();
      expect(worker.status().running).toBe(false);
    });

    it("never leaves work claimed as running after shutdown", async () => {
      await queue.enqueue({ handler: "report.daily" }, OWNER);
      await worker.tick();
      worker.onApplicationBootstrap();
      await worker.onApplicationShutdown("SIGTERM");
      const open = db.rows.automationAttempt!.filter((a) => a.status === "running");
      expect(open).toHaveLength(0);
    });

    it("releases an in-flight lock and closes its attempt when the drain deadline passes", async () => {
      // A handler that never settles on its own: the drain deadline is the only
      // way shutdown completes, which is the case this release exists for.
      process.env.AUTOMATION_SHUTDOWN_DRAIN_MS = "40";
      const hanging = { executeAction: () => new Promise<never>(() => {}) };
      const slowWorker = new AutomationWorkerService(
        db.db,
        queue,
        hanging as unknown as BossExecutorService,
      );
      const command = await db.db.bossCommand.create({ data: { text: "cmd", autonomyLevel: 3 } });
      const plan = await db.db.bossPlan.create({ data: { commandId: command.id as string, objective: "o" } });
      const task = await db.db.bossTask.create({ data: { planId: plan.id as string, order: 1, title: "t" } });
      const action = await db.db.bossAction.create({
        data: { taskId: task.id as string, tool: "analytics.read", input: {}, autonomyLevel: 3, requiredAutonomy: 1, status: "approved" },
      });
      const { job } = await queue.enqueue(
        { handler: "action.execute", payload: { actionId: action.id } },
        OWNER,
      );

      slowWorker.onApplicationBootstrap();
      const ticking = slowWorker.tick();
      // The job is claimed and its handler is stuck.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(db.rows.automationJob![0]).toMatchObject({ status: "running" });
      expect(db.rows.automationAttempt!.filter((a) => a.status === "running")).toHaveLength(1);

      await slowWorker.onApplicationShutdown("SIGTERM");

      // Not left falsely running, and immediately claimable by another worker.
      expect(db.rows.automationJob![0]).toMatchObject({ status: "queued", lockedBy: null, lockedAt: null });
      const openAttempts = db.rows.automationAttempt!.filter((a) => a.status === "running");
      expect(openAttempts).toHaveLength(0);
      const released = db.rows.automationAttempt![0] as unknown as { status: string; error: string };
      expect(released.status).toBe("failed");
      expect(released.error).toMatch(/shut down with the attempt still in flight/);
      expect(db.rows.bossAuditLog!.map((r) => r.verb)).toContain("lock_released");
      expect(db.rows.automationJob![0]!.id).toBe(job.id);

      // The abandoned handler finally settling must not overwrite the released row.
      void ticking.catch(() => undefined);
    });

    it("does not release a job another worker took over", async () => {
      process.env.AUTOMATION_SHUTDOWN_DRAIN_MS = "40";
      await queue.enqueue({ handler: "report.daily" }, OWNER);
      await queue.claimDue("other-worker", 1);
      expect(await queue.releaseWorkerLocks("not-the-owner", "shutting down")).toEqual([]);
      expect(db.rows.automationJob![0]).toMatchObject({ status: "running", lockedBy: "other-worker" });
    });
  });
});
