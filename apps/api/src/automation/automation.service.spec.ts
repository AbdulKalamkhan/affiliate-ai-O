import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

import { makeFakeDb } from "../test/fake-db";
import type { Principal } from "../security/principal";
import { AutomationService, LOCK_TIMEOUT_MS, type AutomationJobView } from "./automation.service";

const OWNER: Principal = { id: "api-key-owner", role: "owner", authMethod: "api_key" };
const OPERATOR: Principal = { id: "op-1", role: "operator", authMethod: "api_key" };
const VIEWER: Principal = { id: "viewer-1", role: "viewer", authMethod: "api_key" };

/**
 * The queue's autonomy ceiling is `AUTOMATION_AUTONOMY_LEVEL`, not a Boss
 * command, so the spec drives it through the environment.
 */
const setAutonomy = (level: number) => {
  process.env.AUTOMATION_AUTONOMY_LEVEL = String(level);
};

describe("AutomationService", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let service: AutomationService;

  beforeEach(() => {
    db = makeFakeDb();
    service = new AutomationService(db.db);
    setAutonomy(3);
  });

  afterEach(() => {
    delete process.env.AUTOMATION_AUTONOMY_LEVEL;
  });

  const auditVerbs = () => db.rows.bossAuditLog!.map((r) => r.verb);
  const auditFor = (verb: string) => db.rows.bossAuditLog!.filter((r) => r.verb === verb);

  // ------------------------------------------------------------------ enqueue

  describe("enqueue", () => {
    it("creates a queued job with an explicit state", async () => {
      const { job, deduplicated } = await service.enqueue({ handler: "report.daily" }, OWNER);
      expect(deduplicated).toBe(false);
      expect(job.status).toBe("queued");
      expect(job.attemptCount).toBe(0);
      expect(job.maxAttempts).toBe(3);
      expect(job.lastError).toBeNull();
      expect(job.finishedAt).toBeNull();
    });

    it("records the AUTHENTICATED requester, never a body-supplied identity", async () => {
      const { job } = await service.enqueue(
        { handler: "report.daily" },
        OPERATOR,
      );
      expect(job.requestedBy).toBe("op-1");
    });

    it("audits every enqueue with the real handler and side effect", async () => {
      await service.enqueue({ handler: "report.daily", payload: { window: "day" } }, OWNER);
      const enqueued = auditFor("enqueued");
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0].entityType).toBe("automation_job");
      expect(enqueued[0].actor).toBe("api-key-owner");
      expect((enqueued[0].detail as { handler: string }).handler).toBe("report.daily");
    });

    it("refuses an unregistered handler and audits the denial", async () => {
      await expect(service.enqueue({ handler: "totally.made.up" }, OWNER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const denied = auditFor("enqueue_denied");
      expect(denied).toHaveLength(1);
      expect((denied[0].detail as { denyCode: string }).denyCode).toBe("UNKNOWN_HANDLER");
    });

    it("refuses a viewer: queueing is a write capability", async () => {
      await expect(service.enqueue({ handler: "report.daily" }, VIEWER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.rows.automationJob!).toHaveLength(0);
    });

    it("allows an operator to queue an internal read-only handler", async () => {
      await expect(service.enqueue({ handler: "report.daily" }, OPERATOR)).resolves.toMatchObject({
        deduplicated: false,
      });
    });

    it("refuses a handler above the configured queue autonomy level", async () => {
      setAutonomy(2);
      // report.daily requires autonomy 1, so it is allowed at level 2.
      await expect(service.enqueue({ handler: "report.daily" }, OWNER)).resolves.toBeTruthy();
      // revenue.reconcile requires autonomy 3.
      await expect(service.enqueue({ handler: "revenue.reconcile" }, OWNER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.rows.automationJob!).toHaveLength(1);
    });

    it("is locked at autonomy 0 by default, so nothing runs without explicit Owner consent", async () => {
      delete process.env.AUTOMATION_AUTONOMY_LEVEL;
      await expect(service.enqueue({ handler: "report.daily" }, OWNER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.enqueue({ handler: "report.daily" }, OWNER)).rejects.toThrow(
        /AUTOMATION_AUTONOMY_LEVEL/,
      );
    });

    it("is independent of Boss command history: a command is not a global autonomy grant", async () => {
      setAutonomy(3);
      // No boss commands exist at all, yet the configured ceiling still applies.
      expect(db.rows.bossCommand).toHaveLength(0);
      await expect(service.enqueue({ handler: "revenue.reconcile" }, OWNER)).resolves.toBeTruthy();
    });

    it("reports the current ceiling and which handlers are blocked by it", async () => {
      setAutonomy(2);
      const stats = await service.stats();
      expect(stats.autonomyLevel).toBe(2);
      expect(stats.autonomySource).toBe("AUTOMATION_AUTONOMY_LEVEL");
      expect(stats.blockedHandlers).toEqual([
        { name: "marketplace.sync", requiredAutonomyLevel: 4 },
        { name: "revenue.reconcile", requiredAutonomyLevel: 3 },
      ]);
    });

    it("labels an unconfigured queue as default_0_locked rather than pretending it is ready", async () => {
      delete process.env.AUTOMATION_AUTONOMY_LEVEL;
      const stats = await service.stats();
      expect(stats.autonomyLevel).toBe(0);
      expect(stats.autonomySource).toBe("default_0_locked");
      expect(stats.blockedHandlers.length).toBeGreaterThan(0);
    });

    it("rejects an invalid payload with every problem listed", async () => {
      await expect(
        service.enqueue({ handler: "", maxAttempts: 0, runAt: "not-a-date" }, OWNER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a missing handler", async () => {
      await expect(service.enqueue({ handler: "  " }, OWNER)).rejects.toThrow(/HANDLER_REQUIRED/);
    });
  });

  // -------------------------------------------------------------- idempotency

  describe("idempotency", () => {
    it("returns the existing job instead of duplicating the work", async () => {
      const first = await service.enqueue(
        { handler: "report.daily", idempotencyKey: "daily-2026-09-27" },
        OWNER,
      );
      const second = await service.enqueue(
        { handler: "report.daily", idempotencyKey: "daily-2026-09-27" },
        OWNER,
      );
      expect(second.deduplicated).toBe(true);
      expect(second.job.id).toBe(first.job.id);
      expect(db.rows.automationJob!).toHaveLength(1);
      expect(second.reason).toMatch(/without duplicating work/);
    });

    it("treats a client retry as a no-op, not a second publish or money write", async () => {
      for (let i = 0; i < 5; i += 1) {
        await service.enqueue(
          { handler: "action.execute", idempotencyKey: "action_123", payload: { actionId: "a1" } },
          OWNER,
        );
      }
      expect(db.rows.automationJob!).toHaveLength(1);
    });

    it("scopes the key per handler so two different handlers can share a key", async () => {
      setAutonomy(3);
      await service.enqueue({ handler: "report.daily", idempotencyKey: "k1" }, OWNER);
      await service.enqueue({ handler: "revenue.reconcile", idempotencyKey: "k1" }, OWNER);
      expect(db.rows.automationJob!).toHaveLength(2);
    });

    it("allows genuinely distinct work with no key", async () => {
      await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.enqueue({ handler: "report.daily" }, OWNER);
      expect(db.rows.automationJob!).toHaveLength(2);
    });

    it("survives a real concurrent enqueue race on the same key", async () => {
      // Two requests can both read "no such job" before either inserts. The
      // database unique index is the real serialiser, so the loser must see
      // P2002 — and the service must return the winner's job, not a 500.
      const realFindMany = db.db.automationJob.findMany.bind(db.db.automationJob);
      let reads = 0;
      // The second request's dedupe read happens before the first request's row
      // is visible, so it sees an empty queue. That is the whole race: read,
      // then both insert, and the index rejects exactly one of them.
      db.db.automationJob.findMany = (async (args: never) => {
        reads += 1;
        if (reads === 2) return [];
        return realFindMany(args);
      }) as unknown as typeof db.db.automationJob.findMany;

      // The unique violation itself comes from the fake database's real
      // (handler, idempotencyKey) index enforcement, not from a hand-raised
      // error, so this exercises the same path a live P2002 would take.

      const winner = await service.enqueue(
        { handler: "report.daily", idempotencyKey: "race-key" },
        OWNER,
      );
      const loser = await service.enqueue(
        { handler: "report.daily", idempotencyKey: "race-key" },
        OWNER,
      );

      expect(winner.deduplicated).toBe(false);
      expect(loser.deduplicated).toBe(true);
      expect(loser.job.id).toBe(winner.job.id);
      expect(loser.reason).toMatch(/concurrent request/);
      expect(db.rows.automationJob!).toHaveLength(1);
      expect(auditFor("enqueue_deduplicated")).toHaveLength(1);
    });

    it("still surfaces a unique violation that is not an idempotency race", async () => {
      // If the row cannot be re-read after a unique failure, the error is real
      // and must not be swallowed into a fake success.
      const realCreate = db.db.automationJob.create.bind(db.db.automationJob);
      db.db.automationJob.create = (async () => {
        const err = new Error("Unique constraint failed") as Error & { code: string };
        err.code = "P2002";
        throw err;
      }) as unknown as typeof db.db.automationJob.create;
      await expect(
        service.enqueue({ handler: "report.daily", idempotencyKey: "ghost" }, OWNER),
      ).rejects.toThrow(/Unique constraint/);
      db.db.automationJob.create = realCreate as unknown as typeof db.db.automationJob.create;
    });
  });

  // -------------------------------------------------------------------- claim

  describe("claimDue", () => {
    it("claims a due job, increments the attempt, and opens an attempt row", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      const claimed = await service.claimDue("worker-a", 1);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].status).toBe("running");
      expect(claimed[0].attemptCount).toBe(1);
      expect(claimed[0].lockedBy).toBe("worker-a");
      expect(claimed[0].lockedAt).toBeInstanceOf(Date);
      expect(db.rows.automationAttempt).toHaveLength(1);
      expect(db.rows.automationAttempt![0]).toMatchObject({ jobId: job.id, attempt: 1, status: "running" });
      expect(auditFor("claimed")).toHaveLength(1);
    });

    it("does NOT claim a job scheduled for the future (backoff is respected)", async () => {
      await service.enqueue(
        { handler: "report.daily", runAt: new Date(Date.now() + 60_000) },
        OWNER,
      );
      expect(await service.claimDue("worker-a", 5)).toHaveLength(0);
    });

    it("claims a job once its runAt has passed", async () => {
      const runAt = new Date(Date.now() - 1_000);
      await service.enqueue({ handler: "report.daily", runAt }, OWNER);
      expect(await service.claimDue("worker-a", 5)).toHaveLength(1);
    });

    it("never hands the same job to two workers", async () => {
      await service.enqueue({ handler: "report.daily" }, OWNER);
      const first = await service.claimDue("worker-a", 1);
      const second = await service.claimDue("worker-b", 1);
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);
    });

    it("does not re-claim a running job", async () => {
      await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      expect(await service.claimDue("worker-b", 1)).toHaveLength(0);
    });

    it("respects the batch limit", async () => {
      for (let i = 0; i < 4; i += 1) {
        await service.enqueue({ handler: "report.daily", idempotencyKey: `k${i}` }, OWNER);
      }
      expect(await service.claimDue("worker-a", 2)).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------ outcome

  describe("markSucceeded", () => {
    it("closes the job and its attempt with the real output", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      const done = await service.markSucceeded(job.id, { clicks: 4 }, { workerId: "worker-a" });
      expect(done.status).toBe("succeeded");
      expect(done.finishedAt).toBeInstanceOf(Date);
      expect(done.lastError).toBeNull();
      expect(done.output).toEqual({ clicks: 4 });
      expect(done.lockedBy).toBeNull();
      const attempt = db.rows.automationAttempt![0]!;
      expect(attempt.status).toBe("succeeded");
      expect(attempt.finishedAt).toBeInstanceOf(Date);
      expect(attempt.durationMs).toBeGreaterThanOrEqual(0);
      expect(auditFor("succeeded")).toHaveLength(1);
    });

    it("refuses to succeed a job that is not running", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await expect(service.markSucceeded(job.id, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses to succeed an unknown job", async () => {
      await expect(service.markSucceeded("nope", {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("markFailed", () => {
    it("re-queues a retryable failure with exponential backoff and keeps the real error", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 3 }, OWNER);
      await service.claimDue("worker-a", 1);
      const { job: after, decision } = await service.markFailed(job.id, new Error("db timeout"), {
        workerId: "worker-a",
        now: new Date("2026-09-27T10:00:00.000Z"),
        random: () => 1,
      });
      expect(decision.outcome).toBe("retry");
      expect(after.status).toBe("queued");
      expect(after.lastError).toBe("db timeout");
      expect(new Date(after.runAt as Date).getTime()).toBeGreaterThan(new Date("2026-09-27T10:00:00.000Z").getTime());
      expect(after.lockedBy).toBeNull();
      expect(after.finishedAt).toBeNull();
      expect(auditFor("retry_scheduled")).toHaveLength(1);
    });

    it("keeps retrying until the budget is exhausted, then dead-letters", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 2 }, OWNER);
      await service.claimDue("worker-a", 1);
      const r1 = await service.markFailed(job.id, new Error("attempt one"), { now: new Date() });
      expect(r1.decision.outcome).toBe("retry");
      expect(r1.job.attemptCount).toBe(1);

      // The retry becomes due immediately so the second attempt can run.
      db.rows.automationJob![0]!.runAt = new Date(Date.now() - 1);
      const second = await service.claimDue("worker-a", 1);
      expect(second).toHaveLength(1);
      expect(second[0].attemptCount).toBe(2);

      const r2 = await service.markFailed(job.id, new Error("attempt two"), { now: new Date() });
      expect(r2.decision.outcome).toBe("dead_letter");
      expect(r2.job.status).toBe("dead_letter");
      expect(r2.job.finishedAt).toBeInstanceOf(Date);
      expect(r2.job.lastError).toBe("attempt two");
    });

    it("dead-letters a non-retryable failure at once", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 5 }, OWNER);
      await service.claimDue("worker-a", 1);
      const { job: after, decision } = await service.markFailed(job.id, new Error("bad capability"), {
        retryable: false,
      });
      expect(decision.outcome).toBe("dead_letter");
      expect(after.status).toBe("dead_letter");
      expect(auditFor("dead_lettered")).toHaveLength(1);
    });

    it("records a non-Error rejection without pretending it succeeded", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      const { job: after } = await service.markFailed(job.id, "plain string failure", {
        retryable: false,
      });
      expect(after.lastError).toBe("plain string failure");
      expect(after.status).toBe("dead_letter");
    });

    it("closes the attempt row as failed with the real error", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("handler exploded"), { retryable: false });
      const attempt = db.rows.automationAttempt![0]!;
      expect(attempt.status).toBe("failed");
      expect(attempt.error).toBe("handler exploded");
      expect(attempt.finishedAt).toBeInstanceOf(Date);
    });

    it("refuses to change a terminal job", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("x"), { retryable: false });
      await expect(service.markFailed(job.id, new Error("y"))).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses to fail an unknown job", async () => {
      await expect(service.markFailed("nope", new Error("x"))).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ------------------------------------------------------------- dead letters

  describe("dead letters", () => {
    it("lists dead-lettered jobs with their real error", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 1 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("permanently broken"), { retryable: false });
      const dlq = await service.deadLetters();
      expect(dlq).toHaveLength(1);
      expect(dlq[0].id).toBe(job.id);
      expect(dlq[0].lastError).toBe("permanently broken");
    });

    it("does not list healthy or queued jobs in the dead-letter queue", async () => {
      await service.enqueue({ handler: "report.daily" }, OWNER);
      expect(await service.deadLetters()).toHaveLength(0);
    });

    it("replays a reviewed dead letter with a fresh attempt budget", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 1, idempotencyKey: "k" }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("transient provider error"), { retryable: false });
      const replayed = await service.replayDeadLetter(job.id, { principal: OWNER });
      expect(replayed.status).toBe("queued");
      expect(replayed.attemptCount).toBe(0);
      expect(replayed.lastError).toBeNull();
      expect(replayed.finishedAt).toBeNull();
      expect(auditFor("replayed")).toHaveLength(1);
    });

    it("lets a replayed job actually run again", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 1 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("x"), { retryable: false });
      await service.replayDeadLetter(job.id, { principal: OWNER });
      const claimed = await service.claimDue("worker-a", 1);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].attemptCount).toBe(1);
    });

    it("can replay the SAME job twice without violating the (handler, idempotencyKey) unique index", async () => {
      // Regression: the replay key used to be derived from the ORIGINAL key, so
      // replaying job B could collide with an already-replayed job A. That
      // produced a P2002 unique violation against real Postgres.
      setAutonomy(4);
      const { job } = await service.enqueue(
        { handler: "marketplace.sync", idempotencyKey: "shared-key", maxAttempts: 1 },
        OWNER,
      );
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("x"), { retryable: false });
      const first = await service.replayDeadLetter(job.id, { principal: OWNER });
      expect(first.idempotencyKey).not.toBe("shared-key");
      expect(first.replayCount).toBe(1);

      // A second job reusing the same original key, then replayed too.
      const other = await service.enqueue(
        { handler: "marketplace.sync", idempotencyKey: "other-key", maxAttempts: 1 },
        OWNER,
      );
      await service.claimDue("worker-a", 1);
      await service.markFailed(other.job.id, new Error("x"), { retryable: false });
      await expect(
        service.replayDeadLetter(other.job.id, { principal: OWNER }),
      ).resolves.toMatchObject({ status: "queued" });
      // Re-replaying the first job after it fails again must also be safe.
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("y"), { retryable: false });
      await expect(service.replayDeadLetter(job.id, { principal: OWNER })).resolves.toMatchObject({
        status: "queued",
        replayCount: 2,
      });
    });

    it("gives each replay a distinct key so no two rows can ever share one", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 1 }, OWNER);
      const keys: unknown[] = [];
      for (let i = 0; i < 3; i += 1) {
        await service.claimDue("worker-a", 1);
        await service.markFailed(job.id, new Error("boom"), { retryable: false });
        const replayed = await service.replayDeadLetter(job.id, { principal: OWNER });
        keys.push(replayed.idempotencyKey);
      }
      expect(new Set(keys).size).toBe(3);
      expect(keys).toEqual([
        `${job.id}#replay:1`,
        `${job.id}#replay:2`,
        `${job.id}#replay:3`,
      ]);
      // One row only: the replay mutates the same job, it never forks a new one.
      expect(db.rows.automationJob!).toHaveLength(1);
    });

    it("records the replay generation in the audit trail", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 1 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("boom"), { retryable: false });
      await service.replayDeadLetter(job.id, { principal: OWNER });
      const replay = auditFor("replayed")[0]!;
      expect(replay.detail).toMatchObject({ replayGeneration: 1, idempotencyKey: `${job.id}#replay:1` });
    });

    it("refuses to replay a job that is not dead-lettered", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await expect(service.replayDeadLetter(job.id, { principal: OWNER })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("refuses a viewer replay", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 1 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("x"), { retryable: false });
      await expect(service.replayDeadLetter(job.id, { principal: VIEWER })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("refuses to replay an unknown job", async () => {
      await expect(service.replayDeadLetter("nope", { principal: OWNER })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ------------------------------------------------------------- stale locks

  describe("recoverStaleLocks", () => {
    it("requeues a job whose worker died mid-run", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      const now = new Date();
      const recovered = await service.recoverStaleLocks(
        new Date(now.getTime() + LOCK_TIMEOUT_MS + 1_000),
      );
      expect(recovered).toEqual([job.id]);
      const after = await service.get(job.id);
      expect(after.status).toBe("queued");
      expect(after.lockedBy).toBeNull();
      expect(after.lockedAt).toBeNull();
      expect(auditFor("lock_recovered")).toHaveLength(1);
    });

    it("closes the abandoned attempt as failed so nothing looks 'still running'", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      const now = new Date();
      const recovered = await service.recoverStaleLocks(new Date(now.getTime() + LOCK_TIMEOUT_MS + 1_000));
      expect(recovered).toEqual([job.id]);
      const attempt = db.rows.automationAttempt![0]!;
      expect(attempt.status).toBe("failed");
      expect(attempt.error).toMatch(/lock expired/);
    });

    it("leaves a fresh lock alone so a live worker is not double-run", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OWNER);
      await service.claimDue("worker-a", 1);
      expect(await service.recoverStaleLocks(new Date())).toEqual([]);
      expect((await service.get(job.id)).status).toBe("running");
    });

    it("does nothing when there is no work in flight", async () => {
      expect(await service.recoverStaleLocks(new Date())).toEqual([]);
    });
  });

  // ------------------------------------------------------------------- reads

  describe("reads and stats", () => {
    it("reports honest counts by status", async () => {
      const a = await service.enqueue({ handler: "report.daily", idempotencyKey: "a" }, OWNER);
      await service.enqueue({ handler: "report.daily", idempotencyKey: "b" }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markSucceeded(a.job.id, { ok: true });
      const stats = await service.stats();
      expect(stats.total).toBe(2);
      expect(stats.byStatus.succeeded).toBe(1);
      expect(stats.byStatus.queued).toBe(1);
      expect(stats.deadLetter).toBe(0);
    });

    it("counts a job awaiting backoff as retrying, not as fresh work", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 3 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("x"), { now: new Date() });
      const stats = await service.stats();
      expect(stats.retrying).toBe(1);
    });

    it("separates a job that is runnable now from one still in backoff", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 3 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("x"), { now: new Date() });
      // The retry is scheduled 1s out, so it is queued but NOT due yet.
      const stats = await service.stats();
      expect(stats.byStatus.queued).toBe(1);
      expect(stats.retrying).toBe(1);
      expect(stats.dueNow).toBe(0);
      // Once the backoff elapses it becomes genuinely runnable.
      expect((await service.stats(new Date(Date.now() + 60_000))).dueNow).toBe(1);
    });

    it("counts a job with no prior failure as due", async () => {
      await service.enqueue({ handler: "report.daily" }, OWNER);
      const stats = await service.stats();
      expect(stats.dueNow).toBe(1);
      expect(stats.retrying).toBe(0);
    });

    it("counts dead letters explicitly", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 1 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("x"), { retryable: false });
      expect((await service.stats()).deadLetter).toBe(1);
    });

    it("reports an empty queue as empty, never as fabricated activity", async () => {
      const stats = await service.stats();
      expect(stats.total).toBe(0);
      expect(stats.oldestQueuedAt).toBeNull();
    });

    it("returns the attempt history in order", async () => {
      const { job } = await service.enqueue({ handler: "report.daily", maxAttempts: 3 }, OWNER);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("first"), { now: new Date() });
      db.rows.automationJob![0]!.runAt = new Date(Date.now() - 1);
      await service.claimDue("worker-a", 1);
      await service.markFailed(job.id, new Error("second"), { now: new Date() });
      const attempts = (await service.attemptsFor(job.id)) as Array<{ attempt: number; status: string; error: string }>;
      expect(attempts.map((a) => a.attempt)).toEqual([1, 2]);
      expect(attempts.every((a) => a.status === "failed")).toBe(true);
      expect(attempts[0].error).toBe("first");
    });

    it("filters by status and rejects an invalid status", async () => {
      await service.enqueue({ handler: "report.daily" }, OWNER);
      expect(await service.list({ status: "queued" })).toHaveLength(1);
      expect(await service.list({ status: "succeeded" })).toHaveLength(0);
      await expect(service.list({ status: "probably_done" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("caps the list length", async () => {
      setAutonomy(3);
      for (let i = 0; i < 5; i += 1) {
        await service.enqueue({ handler: "report.daily", idempotencyKey: `k${i}` }, OWNER);
      }
      expect(await service.list({ limit: 2 })).toHaveLength(2);
    });

    it("404s an unknown job instead of inventing one", async () => {
      await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns a job with the requestedBy attribution intact", async () => {
      const { job } = await service.enqueue({ handler: "report.daily" }, OPERATOR);
      const loaded = (await service.get(job.id)) as AutomationJobView;
      expect(loaded.requestedBy).toBe("op-1");
    });
  });

  // ------------------------------------------------------------------ handlers

  describe("handlers", () => {
    it("exposes declared handlers with an honest implementation flag", async () => {
      const result = await service.handlers();
      const daily = result.handlers.find((h) => h.name === "report.daily");
      const sync = result.handlers.find((h) => h.name === "marketplace.sync");
      expect(daily?.implementation).toBe("implemented");
      expect(sync?.implementation).toBe("not_implemented");
      expect(result.sideEffectNote).toMatch(/no marketplace or external channel is connected/);
    });
  });

  it("audits nothing on a pure read", async () => {
    await service.stats();
    await service.deadLetters();
    expect(auditVerbs()).toHaveLength(0);
  });
});
