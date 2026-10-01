-- Bind each Owner approval to the exact state the approver actually saw.
--
-- An approval that recorded only "action X is approved" could not be checked
-- against the thing that later changed: mutating the action after approval left
-- the earlier consent silently in force. These columns make staleness
-- detectable, so a version bump or an input change invalidates the approval
-- automatically instead of inheriting it.
--
-- Additive only: every column is nullable and BossAction.version defaults to 1,
-- which is the value pre-existing rows are already at. No data is rewritten and
-- no constraint is tightened, so this is safe to apply against a live database.

ALTER TABLE "boss_actions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "boss_approvals" ADD COLUMN "actionType" TEXT;
ALTER TABLE "boss_approvals" ADD COLUMN "actionVersion" INTEGER;
ALTER TABLE "boss_approvals" ADD COLUMN "targetAccount" TEXT;
ALTER TABLE "boss_approvals" ADD COLUMN "targetObject" TEXT;
ALTER TABLE "boss_approvals" ADD COLUMN "inputHash" TEXT;
ALTER TABLE "boss_approvals" ADD COLUMN "evidence" JSONB;
