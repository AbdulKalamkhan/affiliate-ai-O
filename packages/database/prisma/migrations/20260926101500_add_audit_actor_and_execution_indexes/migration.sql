-- Phase-01A follow-up: global audit trail (actor + nullable command) and the
-- approval/tool-call execution indexes.
--
-- SAFETY: purely additive. `commandId` is relaxed from REQUIRED to NULL so that
-- non-command audits (approvals, tool calls, money events) can be recorded in
-- the same immutable trail. No rows are deleted or rewritten.

-- AlterTable
ALTER TABLE "boss_audit_logs" ALTER COLUMN "commandId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "boss_audit_logs" ADD COLUMN     "actor" TEXT;

-- CreateIndex
CREATE INDEX "boss_audit_logs_entityType_createdAt_idx" ON "boss_audit_logs"("entityType", "createdAt");

-- CreateIndex
CREATE INDEX "boss_actions_status_createdAt_idx" ON "boss_actions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "boss_tool_calls_tool_createdAt_idx" ON "boss_tool_calls"("tool", "createdAt");
