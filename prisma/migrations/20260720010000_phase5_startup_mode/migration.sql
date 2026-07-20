-- Phase 5: Startup Mode — Zero-to-Validated Business Engine
-- Additive migration: extends OwnerStartupSession, StartupIdeaRecord,
-- BusinessObjective, BusinessRiskEntry, ConstraintResolutionRecord,
-- and adds 10 new startup-mode models.

-- ─── Extend OwnerStartupSession ─────────────────────────────────────────────

ALTER TABLE "owner_startup_session"
  ADD COLUMN IF NOT EXISTS "session_purpose" TEXT,
  ADD COLUMN IF NOT EXISTS "entry_path" TEXT NOT NULL DEFAULT 'NEED_OPTIONS',
  ADD COLUMN IF NOT EXISTS "profile_data" JSONB,
  ADD COLUMN IF NOT EXISTS "profile_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "system_recommendation_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "research_plan_id" UUID;

-- Migrate existing ACTIVE status to DRAFT (safe: ACTIVE was the only status)
UPDATE "owner_startup_session" SET "status" = 'DRAFT' WHERE "status" = 'ACTIVE';

-- ─── Extend StartupIdeaRecord ────────────────────────────────────────────────

ALTER TABLE "startup_idea_record"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "target_customer" TEXT,
  ADD COLUMN IF NOT EXISTS "value_prop_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "revenue_model" TEXT,
  ADD COLUMN IF NOT EXISTS "screening_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "screening_reasons" JSONB,
  ADD COLUMN IF NOT EXISTS "screening_constraints" JSONB,
  ADD COLUMN IF NOT EXISTS "evidence_required" JSONB,
  ADD COLUMN IF NOT EXISTS "modification_suggestion" TEXT,
  ADD COLUMN IF NOT EXISTS "what_could_change" TEXT,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "superseded_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "startup_idea_record_workspace_id_screening_status_idx"
  ON "startup_idea_record" ("workspace_id", "screening_status");

-- ─── Extend BusinessObjective ────────────────────────────────────────────────

ALTER TABLE "business_objectives"
  ADD COLUMN IF NOT EXISTS "linked_startup_session_id" UUID,
  ADD COLUMN IF NOT EXISTS "linked_startup_idea_id" UUID;

-- ─── Extend BusinessRiskEntry ────────────────────────────────────────────────

ALTER TABLE "business_risk_entries"
  ADD COLUMN IF NOT EXISTS "linked_startup_session_id" UUID;

-- ─── Extend ConstraintResolutionRecord ──────────────────────────────────────

ALTER TABLE "constraint_resolution_records"
  ADD COLUMN IF NOT EXISTS "linked_startup_session_id" UUID;

-- ─── StartupHypothesis ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_hypotheses" (
  "id"                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"            UUID NOT NULL,
  "session_id"              UUID NOT NULL,
  "idea_id"                 UUID NOT NULL,
  "statement"               TEXT NOT NULL,
  "hypothesis_type"         TEXT NOT NULL,
  "evidence_currently"      TEXT,
  "confidence_before"       INTEGER NOT NULL DEFAULT 0,
  "falsification_criteria"  TEXT,
  "validation_method"       TEXT,
  "sample_threshold"        TEXT,
  "expected_cost_cents"     INTEGER,
  "expected_duration_days"  INTEGER,
  "requires_owner_approval" BOOLEAN NOT NULL DEFAULT false,
  "priority_score"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "result"                  TEXT NOT NULL DEFAULT 'PENDING',
  "interpretation"          TEXT,
  "confidence_after"        INTEGER,
  "effect_on_score"         DOUBLE PRECISION,
  "follow_up_action"        TEXT,
  "validated_at"            TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_hypotheses_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "owner_startup_session"("id") ON DELETE CASCADE,
  CONSTRAINT "startup_hypotheses_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_hypotheses_workspace_id_session_id_idx"
  ON "startup_hypotheses" ("workspace_id", "session_id");
CREATE INDEX IF NOT EXISTS "startup_hypotheses_workspace_id_idea_id_idx"
  ON "startup_hypotheses" ("workspace_id", "idea_id");
CREATE INDEX IF NOT EXISTS "startup_hypotheses_workspace_id_result_idx"
  ON "startup_hypotheses" ("workspace_id", "result");

-- ─── StartupEvidenceRecord ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_evidence_records" (
  "id"                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"                  UUID NOT NULL,
  "session_id"                    UUID NOT NULL,
  "idea_id"                       UUID,
  "hypothesis_id"                 UUID,
  "idempotency_key"               TEXT UNIQUE,
  "source_type"                   TEXT NOT NULL,
  "evidence_type"                 TEXT NOT NULL,
  "source_description"            TEXT NOT NULL,
  "retrieved_at"                  TIMESTAMPTZ NOT NULL,
  "geography"                     TEXT,
  "customer_segment"              TEXT,
  "method"                        TEXT,
  "sample_context"                TEXT,
  "observed_result"               TEXT NOT NULL,
  "limitations"                   TEXT,
  "reliability_score"             INTEGER NOT NULL DEFAULT 50,
  "confidence"                    INTEGER NOT NULL DEFAULT 50,
  "owner_verified"                BOOLEAN NOT NULL DEFAULT false,
  "verified_at"                   TIMESTAMPTZ,
  "expires_at"                    TIMESTAMPTZ,
  "current_verification_required" BOOLEAN NOT NULL DEFAULT false,
  "linked_assumption"             TEXT,
  "created_at"                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_evidence_records_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "owner_startup_session"("id") ON DELETE CASCADE,
  CONSTRAINT "startup_evidence_records_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "startup_evidence_records_workspace_id_session_id_idx"
  ON "startup_evidence_records" ("workspace_id", "session_id");
CREATE INDEX IF NOT EXISTS "startup_evidence_records_workspace_id_idea_id_idx"
  ON "startup_evidence_records" ("workspace_id", "idea_id");
CREATE INDEX IF NOT EXISTS "startup_evidence_records_workspace_id_source_type_idx"
  ON "startup_evidence_records" ("workspace_id", "source_type");

-- ─── StartupValidationPlan ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_validation_plans" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"        UUID NOT NULL,
  "session_id"          UUID NOT NULL,
  "idea_id"             UUID NOT NULL,
  "pass_criteria"       TEXT NOT NULL,
  "fail_criteria"       TEXT NOT NULL,
  "safety_limits"       JSONB NOT NULL DEFAULT '{}',
  "spending_limit_cents" INTEGER,
  "stop_conditions"     JSONB NOT NULL DEFAULT '[]',
  "rollback_conditions" JSONB NOT NULL DEFAULT '[]',
  "approved_by_owner"   BOOLEAN NOT NULL DEFAULT false,
  "approved_at"         TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_validation_plans_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_validation_plans_workspace_id_session_id_idx"
  ON "startup_validation_plans" ("workspace_id", "session_id");
CREATE INDEX IF NOT EXISTS "startup_validation_plans_workspace_id_idea_id_idx"
  ON "startup_validation_plans" ("workspace_id", "idea_id");

-- ─── StartupExperiment ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_experiments" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"      UUID NOT NULL,
  "plan_id"           UUID NOT NULL,
  "hypothesis_id"     UUID,
  "mechanism"         TEXT NOT NULL,
  "instructions"      TEXT NOT NULL,
  "script"            TEXT,
  "pass_criteria"     TEXT NOT NULL,
  "fail_criteria"     TEXT NOT NULL,
  "safety_limit_cents" INTEGER,
  "result"            TEXT NOT NULL DEFAULT 'NOT_YET_RUN',
  "result_summary"    TEXT,
  "executed_at"       TIMESTAMPTZ,
  "evidence_ids"      JSONB NOT NULL DEFAULT '[]',
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_experiments_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "startup_validation_plans"("id") ON DELETE CASCADE,
  CONSTRAINT "startup_experiments_hypothesis_id_fkey"
    FOREIGN KEY ("hypothesis_id") REFERENCES "startup_hypotheses"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "startup_experiments_workspace_id_plan_id_idx"
  ON "startup_experiments" ("workspace_id", "plan_id");

-- ─── StartupBusinessModel ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_business_models" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"                UUID NOT NULL,
  "session_id"                  UUID NOT NULL,
  "idea_id"                     UUID NOT NULL,
  "customer_segment"            TEXT NOT NULL,
  "customer_problem"            TEXT NOT NULL,
  "value_proposition"           TEXT NOT NULL,
  "delivery_method"             TEXT NOT NULL,
  "revenue_model"               TEXT NOT NULL,
  "pricing_hypothesis"          TEXT,
  "cost_structure"              JSONB NOT NULL DEFAULT '{}',
  "acquisition_channels"        JSONB NOT NULL DEFAULT '[]',
  "fulfilment_process"          TEXT,
  "suppliers_and_dependencies"  JSONB NOT NULL DEFAULT '[]',
  "key_capabilities"            JSONB NOT NULL DEFAULT '[]',
  "key_metrics"                 JSONB NOT NULL DEFAULT '[]',
  "retention_mechanism"         TEXT,
  "working_capital_cycle"       TEXT,
  "regulatory_requirements"     JSONB NOT NULL DEFAULT '[]',
  "quality_control_requirements" JSONB NOT NULL DEFAULT '[]',
  "failure_modes"               JSONB NOT NULL DEFAULT '[]',
  "defensibility_notes"         TEXT,
  "scale_constraints"           TEXT,
  "version"                     INTEGER NOT NULL DEFAULT 1,
  "superseded_by_id"            UUID,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_business_models_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_business_models_workspace_id_idea_id_idx"
  ON "startup_business_models" ("workspace_id", "idea_id");
CREATE INDEX IF NOT EXISTS "startup_business_models_workspace_id_session_id_idx"
  ON "startup_business_models" ("workspace_id", "session_id");

-- ─── StartupEconomicModel ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_economic_models" (
  "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"              UUID NOT NULL,
  "session_id"                UUID NOT NULL,
  "idea_id"                   UUID NOT NULL,
  "startup_cost_cents"        BIGINT,
  "fixed_monthly_cost_cents"  BIGINT,
  "variable_unit_cost_cents"  BIGINT,
  "price_per_unit_cents"      BIGINT,
  "gross_contribution_cents"  BIGINT,
  "gross_margin_bps"          INTEGER,
  "cac_cents"                 BIGINT,
  "delivery_cost_cents"       BIGINT,
  "refund_allowance_cents"    BIGINT,
  "working_capital_cents"     BIGINT,
  "payment_delay_days"        INTEGER,
  "break_even_volume"         DOUBLE PRECISION,
  "break_even_months"         DOUBLE PRECISION,
  "cash_runway_months"        DOUBLE PRECISION,
  "min_viable_capacity"       DOUBLE PRECISION,
  "max_current_capacity"      DOUBLE PRECISION,
  "owner_labour_hours_per_week" DOUBLE PRECISION,
  "hired_labour_cost_cents"   BIGINT,
  "sensitivity_scenarios"     JSONB NOT NULL DEFAULT '{}',
  "economic_classification"   TEXT NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE',
  "binding_condition"         TEXT,
  "unknown_inputs"            JSONB NOT NULL DEFAULT '[]',
  "version"                   INTEGER NOT NULL DEFAULT 1,
  "superseded_by_id"          UUID,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_economic_models_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_economic_models_workspace_id_idea_id_idx"
  ON "startup_economic_models" ("workspace_id", "idea_id");
CREATE INDEX IF NOT EXISTS "startup_economic_models_workspace_id_session_id_idx"
  ON "startup_economic_models" ("workspace_id", "session_id");

-- ─── StartupMarketSizing ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_market_sizings" (
  "id"                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"                    UUID NOT NULL,
  "session_id"                      UUID NOT NULL,
  "idea_id"                         UUID NOT NULL,
  "reachable_market_units"          DOUBLE PRECISION,
  "reachable_market_revenue_cents"  BIGINT,
  "serviceable_units"               DOUBLE PRECISION,
  "serviceable_revenue_cents"       BIGINT,
  "initial_customer_pool"           DOUBLE PRECISION,
  "capacity_limited_revenue_cents"  BIGINT,
  "channel_limited_revenue_cents"   BIGINT,
  "geography_limited_revenue_cents" BIGINT,
  "formula"                         TEXT,
  "assumptions"                     JSONB NOT NULL DEFAULT '[]',
  "evidence"                        JSONB NOT NULL DEFAULT '[]',
  "confidence"                      INTEGER NOT NULL DEFAULT 0,
  "range_data"                      JSONB NOT NULL DEFAULT '{}',
  "limiting_factor"                 TEXT,
  "sizing_status"                   TEXT NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE',
  "version"                         INTEGER NOT NULL DEFAULT 1,
  "created_at"                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_market_sizings_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_market_sizings_workspace_id_idea_id_idx"
  ON "startup_market_sizings" ("workspace_id", "idea_id");
CREATE INDEX IF NOT EXISTS "startup_market_sizings_workspace_id_session_id_idx"
  ON "startup_market_sizings" ("workspace_id", "session_id");

-- ─── StartupReadinessAssessment ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_readiness_assessments" (
  "id"                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"                  UUID NOT NULL,
  "session_id"                    UUID NOT NULL,
  "idea_id"                       UUID NOT NULL,
  "problem_evidence_score"        INTEGER NOT NULL DEFAULT 0,
  "customer_evidence_score"       INTEGER NOT NULL DEFAULT 0,
  "wtp_evidence_score"            INTEGER NOT NULL DEFAULT 0,
  "solution_feasibility_score"    INTEGER NOT NULL DEFAULT 0,
  "delivery_feasibility_score"    INTEGER NOT NULL DEFAULT 0,
  "acquisition_feasibility_score" INTEGER NOT NULL DEFAULT 0,
  "economic_viability_score"      INTEGER NOT NULL DEFAULT 0,
  "cash_survival_score"           INTEGER NOT NULL DEFAULT 0,
  "resource_readiness_score"      INTEGER NOT NULL DEFAULT 0,
  "regulatory_readiness_score"    INTEGER NOT NULL DEFAULT 0,
  "risk_readiness_score"          INTEGER NOT NULL DEFAULT 0,
  "owner_capacity_score"          INTEGER NOT NULL DEFAULT 0,
  "execution_plan_score"          INTEGER NOT NULL DEFAULT 0,
  "measurement_plan_score"        INTEGER NOT NULL DEFAULT 0,
  "stop_conditions_score"         INTEGER NOT NULL DEFAULT 0,
  "hard_gate_failures"            JSONB NOT NULL DEFAULT '[]',
  "passed_gates"                  JSONB NOT NULL DEFAULT '[]',
  "failed_gates"                  JSONB NOT NULL DEFAULT '[]',
  "unknown_gates"                 JSONB NOT NULL DEFAULT '[]',
  "binding_constraints"           JSONB NOT NULL DEFAULT '[]',
  "evidence_gaps"                 JSONB NOT NULL DEFAULT '[]',
  "safe_next_step"                TEXT NOT NULL,
  "readiness_status"              TEXT NOT NULL DEFAULT 'MORE_VALIDATION_REQUIRED',
  "assessed_at"                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at"                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_readiness_assessments_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_readiness_assessments_workspace_id_idea_id_idx"
  ON "startup_readiness_assessments" ("workspace_id", "idea_id");
CREATE INDEX IF NOT EXISTS "startup_readiness_assessments_workspace_id_session_id_idx"
  ON "startup_readiness_assessments" ("workspace_id", "session_id");

-- ─── StartupOwnerDecision ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_owner_decisions" (
  "id"                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"                    UUID NOT NULL,
  "session_id"                      UUID NOT NULL,
  "idea_id"                         UUID,
  "decision_type"                   TEXT NOT NULL,
  "rationale"                       TEXT,
  "actor_id"                        UUID NOT NULL,
  "approved_scope"                  TEXT,
  "spending_limit_cents"            BIGINT,
  "permitted_actions"               JSONB NOT NULL DEFAULT '[]',
  "prohibited_actions"              JSONB NOT NULL DEFAULT '[]',
  "valid_until"                     TIMESTAMPTZ,
  "review_date"                     TIMESTAMPTZ,
  "material_assumptions"            JSONB NOT NULL DEFAULT '[]',
  "linked_evidence_version"         INTEGER,
  "system_recommendation_snapshot"  JSONB NOT NULL DEFAULT '{}',
  "superseded_by_id"                UUID,
  "superseded_at"                   TIMESTAMPTZ,
  "created_at"                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_owner_decisions_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "owner_startup_session"("id") ON DELETE CASCADE,
  CONSTRAINT "startup_owner_decisions_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "startup_owner_decisions_workspace_id_session_id_idx"
  ON "startup_owner_decisions" ("workspace_id", "session_id");
CREATE INDEX IF NOT EXISTS "startup_owner_decisions_workspace_id_decision_type_idx"
  ON "startup_owner_decisions" ("workspace_id", "decision_type");

-- ─── StartupResearchPlan ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_research_plans" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"        UUID NOT NULL,
  "session_id"          UUID NOT NULL UNIQUE,
  "evidence_domains"    JSONB NOT NULL DEFAULT '[]',
  "completeness_report" JSONB NOT NULL DEFAULT '{}',
  "acquired_domains"    JSONB NOT NULL DEFAULT '[]',
  "material_gaps"       JSONB NOT NULL DEFAULT '[]',
  "approved_by_owner"   BOOLEAN NOT NULL DEFAULT false,
  "approved_at"         TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_research_plans_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "owner_startup_session"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_research_plans_workspace_id_idx"
  ON "startup_research_plans" ("workspace_id");

-- ─── StartupResearchAcquisition ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "startup_research_acquisitions" (
  "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"              UUID NOT NULL,
  "research_plan_id"          UUID NOT NULL,
  "domain"                    TEXT NOT NULL,
  "source_url"                TEXT,
  "source_type"               TEXT NOT NULL,
  "query_method"              TEXT NOT NULL,
  "query_params"              JSONB NOT NULL DEFAULT '{}',
  "raw_result"                TEXT,
  "extracted_facts"           JSONB NOT NULL DEFAULT '[]',
  "retrieved_at"              TIMESTAMPTZ,
  "geography"                 TEXT,
  "applicable_date"           TIMESTAMPTZ,
  "reliability_classification" TEXT,
  "confidence"                INTEGER NOT NULL DEFAULT 0,
  "limitations"               TEXT,
  "staleness_rule_days"       INTEGER,
  "linked_assumptions"        JSONB NOT NULL DEFAULT '[]',
  "linked_decisions"          JSONB NOT NULL DEFAULT '[]',
  "status"                    TEXT NOT NULL DEFAULT 'PENDING',
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "startup_research_acquisitions_plan_id_fkey"
    FOREIGN KEY ("research_plan_id") REFERENCES "startup_research_plans"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_research_acquisitions_workspace_id_plan_id_idx"
  ON "startup_research_acquisitions" ("workspace_id", "research_plan_id");
CREATE INDEX IF NOT EXISTS "startup_research_acquisitions_workspace_id_domain_status_idx"
  ON "startup_research_acquisitions" ("workspace_id", "domain", "status");
