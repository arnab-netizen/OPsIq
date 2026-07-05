-- Proof-outcome reassessment linkage depth pass — OUTCOME_TO_REASSESSMENT keyed by proof.
-- Persist which proof's accepted-then-contradicted reversal triggered a reassessment, so the
-- proof→reassessment link is queryable (did OpsIQ reassess after a contradiction?).
--
-- Minimal, backfill-safe, non-destructive: one nullable uuid column (existing rows stay NULL —
-- no fabricated linkage for historical reassessments) + a (workspace_id, source_proof_id) index
-- for the workspace-scoped lookup.

ALTER TABLE "owner_reassessment_events" ADD COLUMN "sourceProofId" UUID;
CREATE INDEX "owner_reassessment_events_workspaceId_sourceProofId_idx"
  ON "owner_reassessment_events"("workspaceId", "sourceProofId");
