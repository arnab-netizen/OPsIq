-- Opportunity Execution & Delegation Tracking (depth pass) — persist governed, trackable execution tasks
-- derived from the opportunity operating layer (prep checklists, tender readiness, proof-pack requirements,
-- validation actions, portfolio decisions), so delegated work has an owner, a status, and completion
-- evidence that feeds back into opportunity readiness. Additive, backfill-safe, non-destructive: a brand-new
-- table (no change to existing tables). Governance is enforced in code: OpsIQ only drafts/records — it never
-- submits a tender, contacts a customer, or spends; owner-approval tasks can never be auto-completed;
-- evidence-required tasks cannot COMPLETE without evidence. UNIQUE (workspace_id, task_key) makes re-updating
-- a task idempotent (one task per opportunity + task type).

CREATE TABLE "opportunity_execution_tasks" (
  "id"                    UUID NOT NULL,
  "workspace_id"          UUID NOT NULL,
  "task_key"              TEXT NOT NULL,
  "opportunity_key"       TEXT NOT NULL,
  "source_type"           TEXT NOT NULL,
  "source_key"            TEXT NOT NULL,
  "task_type"             TEXT NOT NULL,
  "next_action_owner"     TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'PROPOSED',
  "approval_level"        TEXT NOT NULL,
  "evidence_refs"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "linked_proof_ids"      UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "blocking_reason"       TEXT,
  "outcome_summary"       TEXT,
  "completed_by_user_id"  UUID,
  "completed_by_role"     TEXT,
  "completed_at"          TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opportunity_execution_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "opportunity_execution_tasks_workspace_id_task_key_key" ON "opportunity_execution_tasks"("workspace_id", "task_key");
CREATE INDEX "opportunity_execution_tasks_workspace_id_opportunity_key_idx" ON "opportunity_execution_tasks"("workspace_id", "opportunity_key");
