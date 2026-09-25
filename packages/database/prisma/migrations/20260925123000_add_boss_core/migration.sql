-- CreateTable
CREATE TABLE "boss_commands" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "autonomyLevel" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boss_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_plans" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_tasks" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_actions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "autonomyLevel" INTEGER NOT NULL DEFAULT 2,
    "requiredAutonomy" INTEGER NOT NULL DEFAULT 2,
    "permissionResult" TEXT NOT NULL DEFAULT 'granted',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_audit_logs" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boss_commands_createdAt_idx" ON "boss_commands"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "boss_plans_commandId_key" ON "boss_plans"("commandId");

-- CreateIndex
CREATE INDEX "boss_plans_createdAt_idx" ON "boss_plans"("createdAt");

-- CreateIndex
CREATE INDEX "boss_tasks_planId_order_idx" ON "boss_tasks"("planId", "order");

-- CreateIndex
CREATE INDEX "boss_actions_taskId_idx" ON "boss_actions"("taskId");

-- CreateIndex
CREATE INDEX "boss_audit_logs_commandId_createdAt_idx" ON "boss_audit_logs"("commandId", "createdAt");

-- AddForeignKey
ALTER TABLE "boss_plans" ADD CONSTRAINT "boss_plans_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "boss_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_tasks" ADD CONSTRAINT "boss_tasks_planId_fkey" FOREIGN KEY ("planId") REFERENCES "boss_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_actions" ADD CONSTRAINT "boss_actions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "boss_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_audit_logs" ADD CONSTRAINT "boss_audit_logs_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "boss_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;