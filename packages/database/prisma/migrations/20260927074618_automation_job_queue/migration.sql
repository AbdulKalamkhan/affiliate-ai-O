-- CreateTable
CREATE TABLE "automation_jobs" (
    "id" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "queue" TEXT NOT NULL DEFAULT 'default',
    "idempotencyKey" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "output" JSONB,
    "requestedBy" TEXT,
    "commandId" TEXT,
    "actionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "output" JSONB,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "automation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_jobs_status_runAt_idx" ON "automation_jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "automation_jobs_queue_status_idx" ON "automation_jobs"("queue", "status");

-- CreateIndex
CREATE INDEX "automation_jobs_actionId_idx" ON "automation_jobs"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_jobs_handler_idempotencyKey_key" ON "automation_jobs"("handler", "idempotencyKey");

-- CreateIndex
CREATE INDEX "automation_attempts_jobId_attempt_idx" ON "automation_attempts"("jobId", "attempt");

-- AddForeignKey
ALTER TABLE "automation_attempts" ADD CONSTRAINT "automation_attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "automation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
