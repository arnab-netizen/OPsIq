-- Validation Outcome Persistence (depth pass) — persist what actually happened when an opportunity's
-- validation experiment ran, so the live Opportunity Portfolio can move past NOT_STARTED and make real
-- kill/park/scale-candidate decisions on evidence. Additive, backfill-safe, non-destructive: a brand-new
-- table (no change to existing tables). Governance is enforced in code: PASSED requires evidence, a stop-loss
-- can never PASS, scaling stays gated behind PASSED + safe guardrails + owner approval; numbers are the
-- recorder's own results and are never turned into fabricated profit. UNIQUE (workspace_id, idempotency_key)
-- makes re-recording idempotent.

CREATE TABLE "opportunity_validation_outcomes" (
  "id"                        UUID NOT NULL,
  "workspace_id"              UUID NOT NULL,
  "idempotency_key"           TEXT NOT NULL,
  "experiment_key"            TEXT NOT NULL,
  "opportunity_key"           TEXT NOT NULL,
  "status"                    TEXT NOT NULL,
  "result"                    TEXT NOT NULL,
  "started_at"                TIMESTAMP(3),
  "completed_at"              TIMESTAMP(3),
  "actual_cost"               DOUBLE PRECISION,
  "actual_owner_time_minutes" INTEGER,
  "leads_generated"           INTEGER,
  "responses"                 INTEGER,
  "conversions"               INTEGER,
  "revenue_evidence"          TEXT,
  "margin_evidence"           TEXT,
  "customer_feedback"         TEXT,
  "operational_issues"        TEXT,
  "cash_impact_notes"         TEXT,
  "proof_evidence_refs"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "success_metric_result"     TEXT,
  "failure_metric_result"     TEXT,
  "stop_loss_triggered"       BOOLEAN NOT NULL DEFAULT false,
  "owner_visible_summary"     TEXT NOT NULL,
  "next_recommended_decision" TEXT NOT NULL,
  "approval_level"            TEXT NOT NULL,
  "recorded_by_user_id"       UUID,
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opportunity_validation_outcomes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "opportunity_validation_outcomes_workspace_id_idempotency_key_key" ON "opportunity_validation_outcomes"("workspace_id", "idempotency_key");
CREATE INDEX "opportunity_validation_outcomes_workspace_id_opportunity_key_idx" ON "opportunity_validation_outcomes"("workspace_id", "opportunity_key");
