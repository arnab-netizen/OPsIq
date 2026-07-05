-- Runtime control correlation depth pass — PROOF_TAMPER_SIGNAL_PERSISTENCE.
-- Persist the deterministic AI-precheck tamper signal so tamper-suspected proof is queryable
-- and can drive the Evidence Credibility Graph + Business-Control SLOs from real data.
--
-- Minimal, backfill-safe, non-destructive: a single NOT NULL column with a DEFAULT false, so
-- every existing proof row backfills to false (no tamper claimed for historical proof — no fake
-- signal). Mirrors the existing `duplicate_flagged` column. A composite (workspace_id,
-- tamper_suspected) index makes the tamper-suspected query workspace-scoped and cheap.

ALTER TABLE "proofs" ADD COLUMN "tamper_suspected" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "proofs_workspace_id_tamper_suspected_idx" ON "proofs"("workspace_id", "tamper_suspected");
