-- Phase 3 — Owner Execution and Outcome Closure Engine
-- Extend OwnerActionOutcome with verification, task linkage, and learning fields.
-- All columns are nullable for backward compatibility. No existing rows are affected.

ALTER TABLE "owner_action_outcomes"
    ADD COLUMN "task_key"                    TEXT,
    ADD COLUMN "task_type"                   TEXT,
    ADD COLUMN "verification_status"         TEXT,
    ADD COLUMN "verification_classification" TEXT,
    ADD COLUMN "verified_by_actor_id"        UUID,
    ADD COLUMN "verified_at"                 TIMESTAMP(3),
    ADD COLUMN "observation_window_days"     INTEGER,
    ADD COLUMN "direct_cost"                 DECIMAL(14,2),
    ADD COLUMN "side_effects"                TEXT,
    ADD COLUMN "verification_notes"          TEXT,
    ADD COLUMN "learning_candidate_id"       TEXT;

CREATE INDEX "owner_action_outcomes_workspaceId_verification_classification_idx"
    ON "owner_action_outcomes"("workspaceId", "verification_classification");

CREATE INDEX "owner_action_outcomes_workspaceId_task_key_idx"
    ON "owner_action_outcomes"("workspaceId", "task_key");
