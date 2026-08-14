-- Finance closed-loop learning: add owner_finance_outcome_signals table.
-- Stores one factual outcome signal per OwnerFinanceVerification for Bayesian
-- effectiveness tracking. Additive only — no existing column, table, or index
-- is renamed, dropped, or modified.

CREATE TABLE IF NOT EXISTS "owner_finance_outcome_signals" (
  "id"                   UUID         NOT NULL,
  "workspace_id"         UUID         NOT NULL,
  "business_id"          UUID         NOT NULL,
  "verification_id"      UUID         NOT NULL,
  "action_id"            UUID         NOT NULL,
  "finding_code"         TEXT         NOT NULL,
  "recommendation_code"  TEXT         NOT NULL,
  "verification_status"  TEXT         NOT NULL,
  "reached_target"       BOOLEAN      NOT NULL,
  "before_value"         DOUBLE PRECISION,
  "after_value"          DOUBLE PRECISION,
  "learning_candidate_id" UUID,
  "recorded_at"          TIMESTAMP(3) NOT NULL,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_finance_outcome_signals_pkey" PRIMARY KEY ("id")
);

-- Uniqueness: one signal per verification (one-to-one with OwnerFinanceVerification)
CREATE UNIQUE INDEX IF NOT EXISTS "owner_finance_outcome_signals_verification_id_key"
  ON "owner_finance_outcome_signals"("verification_id");

-- Composite unique: workspace + verification (tenant isolation)
CREATE UNIQUE INDEX IF NOT EXISTS "owner_finance_outcome_signals_workspace_id_verification_id_key"
  ON "owner_finance_outcome_signals"("workspace_id", "verification_id");

-- Lookup indexes for effectiveness queries
CREATE INDEX IF NOT EXISTS "owner_finance_outcome_signals_workspace_id_idx"
  ON "owner_finance_outcome_signals"("workspace_id");

CREATE INDEX IF NOT EXISTS "owner_finance_outcome_signals_business_id_idx"
  ON "owner_finance_outcome_signals"("business_id");

CREATE INDEX IF NOT EXISTS "owner_finance_outcome_signals_finding_code_idx"
  ON "owner_finance_outcome_signals"("finding_code");

CREATE INDEX IF NOT EXISTS "owner_finance_outcome_signals_recommendation_code_idx"
  ON "owner_finance_outcome_signals"("recommendation_code");

-- FK: workspace tenant (restrict delete — signal must outlive business records)
ALTER TABLE "owner_finance_outcome_signals"
  ADD CONSTRAINT "owner_finance_outcome_signals_business_id_fkey"
  FOREIGN KEY ("business_id")
  REFERENCES "owner_businesses"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: verification (one-to-one; restrict delete — signal is learning record)
ALTER TABLE "owner_finance_outcome_signals"
  ADD CONSTRAINT "owner_finance_outcome_signals_verification_id_fkey"
  FOREIGN KEY ("verification_id")
  REFERENCES "owner_finance_verifications"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: action (restrict delete — signal traces back to originating action)
ALTER TABLE "owner_finance_outcome_signals"
  ADD CONSTRAINT "owner_finance_outcome_signals_action_id_fkey"
  FOREIGN KEY ("action_id")
  REFERENCES "owner_finance_actions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
