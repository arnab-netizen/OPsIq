-- Process-Correction Execution Bridge (PASS 20) — persist the governed execution route derived from a
-- process-intelligence / cash-profit cockpit finding, so a diagnosis becomes a trackable task with an owner,
-- approval level, required evidence, completion state, and a reassessment link. Additive, backfill-safe,
-- non-destructive: a brand-new table (no change to existing tables). Governance is enforced in code:
-- owner-approval tasks can never be auto-completed; evidence-required routes cannot COMPLETE without evidence;
-- a completed task records the reassessment it triggered. UNIQUE (workspace_id, task_key) makes re-updating a
-- task idempotent (one task per source finding).

CREATE TABLE "process_execution_tasks" (
  "id"                    UUID NOT NULL,
  "workspace_id"          UUID NOT NULL,
  "task_key"              TEXT NOT NULL,
  "source_family"         TEXT NOT NULL,
  "source_finding_key"    TEXT NOT NULL,
  "execution_route"       TEXT NOT NULL,
  "action_owner"          TEXT NOT NULL,
  "approval_level"        TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'PROPOSED',
  "required_evidence"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidence_refs"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "completion_criteria"   TEXT NOT NULL,
  "reassessment_trigger"  TEXT NOT NULL,
  "risk_if_ignored"       TEXT NOT NULL,
  "owner_visible_summary" TEXT NOT NULL,
  "severity"              TEXT NOT NULL,
  "priority_rank"         INTEGER NOT NULL,
  "completed_by_user_id"  UUID,
  "completed_by_role"     TEXT,
  "completed_at"          TIMESTAMP(3),
  "reassessment_id"       UUID,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "process_execution_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "process_execution_tasks_workspace_id_task_key_key" ON "process_execution_tasks"("workspace_id", "task_key");
CREATE INDEX "process_execution_tasks_workspace_id_status_idx" ON "process_execution_tasks"("workspace_id", "status");
