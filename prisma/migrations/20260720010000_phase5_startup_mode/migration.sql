-- Phase 5: Startup Mode — Zero to Validated Business
-- Extends OwnerStartupSession + StartupIdeaRecord, adds 14 new Phase 5 models.
-- Additive only — no existing columns dropped, no existing constraints changed.

-- ─── Extend OwnerStartupSession ──────────────────────────────────────────────

ALTER TABLE owner_startup_session
  ADD COLUMN IF NOT EXISTS entry_path        TEXT NOT NULL DEFAULT 'HAVE_IDEA',
  ADD COLUMN IF NOT EXISTS profile_version   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_profile_version_id UUID,
  ADD COLUMN IF NOT EXISTS current_system_rec_id       UUID,
  ADD COLUMN IF NOT EXISTS current_owner_decision_id   UUID,
  ADD COLUMN IF NOT EXISTS current_blueprint_id        UUID,
  ADD COLUMN IF NOT EXISTS session_purpose   TEXT;

-- Update status default to DRAFT for new lifecycle
-- Existing rows keep ACTIVE (backward-compatible)

-- ─── Extend StartupIdeaRecord ─────────────────────────────────────────────────

ALTER TABLE startup_idea_record
  ADD COLUMN IF NOT EXISTS version           INT  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS origin_type       TEXT NOT NULL DEFAULT 'OWNER_ENTERED',
  ADD COLUMN IF NOT EXISTS superseded_by_id  UUID,
  ADD COLUMN IF NOT EXISTS screening_status  TEXT NOT NULL DEFAULT 'UNSCREENED',
  ADD COLUMN IF NOT EXISTS screening_data    JSONB,
  ADD COLUMN IF NOT EXISTS origin_data       JSONB,
  ADD COLUMN IF NOT EXISTS profile_version_id UUID,
  ADD COLUMN IF NOT EXISTS current_business_model_version_id UUID,
  ADD COLUMN IF NOT EXISTS current_economic_model_version_id UUID,
  ADD COLUMN IF NOT EXISTS current_readiness_id UUID;

-- ─── Extend BusinessObjective with startup linkage ────────────────────────────

ALTER TABLE business_objectives
  ADD COLUMN IF NOT EXISTS linked_startup_session_id UUID,
  ADD COLUMN IF NOT EXISTS linked_startup_idea_id    UUID;

-- ─── Extend BusinessRiskEntry with startup linkage ────────────────────────────

ALTER TABLE business_risk_entries
  ADD COLUMN IF NOT EXISTS linked_startup_session_id UUID;

-- ─── StartupContextProfileVersion (immutable, append-only) ───────────────────

CREATE TABLE IF NOT EXISTS startup_context_profile_version (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL,
  session_id           UUID NOT NULL,
  actor_id             UUID NOT NULL,
  version_number       INT  NOT NULL,
  profile_data         JSONB NOT NULL,
  change_rationale     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scpv_workspace_session ON startup_context_profile_version (workspace_id, session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scpv_session_version ON startup_context_profile_version (session_id, version_number);

-- ─── StartupHypothesis ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_hypothesis (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL,
  session_id               UUID NOT NULL,
  idea_id                  UUID NOT NULL,
  statement                TEXT NOT NULL,
  hypothesis_type          TEXT NOT NULL,  -- DEMAND | PRICING | DELIVERY | ACQUISITION | ECONOMIC | REGULATORY | SUPPLIER
  confidence_before        INT  NOT NULL DEFAULT 50,  -- 0-100
  falsification_criteria   TEXT NOT NULL,
  validation_method        TEXT NOT NULL,
  expected_cost_cents      BIGINT,
  expected_duration_days   INT,
  requires_owner_approval  BOOLEAN NOT NULL DEFAULT false,
  priority_score           INT NOT NULL DEFAULT 50,  -- DECISION_VALUE x UNCERTAINTY / COST_TIME
  result                   TEXT,   -- CONFIRMED | DISCONFIRMED | PARTIALLY_CONFIRMED | INCONCLUSIVE
  result_summary           TEXT,
  confidence_after         INT,
  effect_on_score          INT,    -- basis points delta
  follow_up_action         TEXT,
  validated_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sh_workspace_session ON startup_hypothesis (workspace_id, session_id);
CREATE INDEX IF NOT EXISTS idx_sh_idea ON startup_hypothesis (workspace_id, idea_id);

-- ─── StartupEvidenceRecord ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_evidence_record (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               UUID NOT NULL,
  session_id                 UUID NOT NULL,
  idea_id                    UUID,
  hypothesis_id              UUID,
  idempotency_key            TEXT,
  source_type                TEXT NOT NULL,  -- AUTHORITATIVE_PRIMARY | OFFICIAL_COMMERCIAL | FIELD_OBSERVATION | OWNER_DIRECT | SYSTEM_INFERENCE | UNVERIFIED
  evidence_type              TEXT NOT NULL,  -- MARKET_SIZE | CUSTOMER_DEMAND | PRICING | DELIVERY | REGULATORY | SUPPLIER | ECONOMIC
  source_name                TEXT,
  source_url                 TEXT,
  retrieved_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  geography                  TEXT,
  customer_segment           TEXT,
  method                     TEXT,
  observed_result            TEXT NOT NULL,
  limitations                TEXT,
  reliability_score          INT NOT NULL DEFAULT 50,  -- 0-100
  confidence                 INT NOT NULL DEFAULT 50,  -- 0-100
  owner_verified             BOOLEAN NOT NULL DEFAULT false,
  verified_at                TIMESTAMPTZ,
  expires_at                 TIMESTAMPTZ,
  current_verification_required BOOLEAN NOT NULL DEFAULT false,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ser_workspace_session ON startup_evidence_record (workspace_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ser_idea ON startup_evidence_record (workspace_id, idea_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ser_idempotency ON startup_evidence_record (session_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ─── StartupValidationPlan ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_validation_plan (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL,
  session_id          UUID NOT NULL,
  idea_id             UUID NOT NULL,
  pass_criteria       TEXT NOT NULL,
  fail_criteria       TEXT NOT NULL,
  spending_limit_cents BIGINT,
  stop_conditions     JSONB NOT NULL DEFAULT '[]',
  safety_limits       JSONB NOT NULL DEFAULT '{}',
  approved_by_owner   BOOLEAN NOT NULL DEFAULT false,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_svp_session_idea ON startup_validation_plan (session_id, idea_id);
CREATE INDEX IF NOT EXISTS idx_svp_workspace ON startup_validation_plan (workspace_id);

-- ─── StartupExperiment ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_experiment (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL,
  plan_id             UUID NOT NULL,
  hypothesis_id       UUID,
  mechanism           TEXT NOT NULL,  -- CUSTOMER_INTERVIEW | SUPPLIER_QUOTE | LANDING_PAGE | LOI | CONCIERGE | PROTOTYPE | PRICE_TEST
  instructions        TEXT NOT NULL,
  pass_criteria       TEXT NOT NULL,
  fail_criteria       TEXT NOT NULL,
  safety_limit_cents  BIGINT,
  result              TEXT,   -- PASSED | FAILED | INCONCLUSIVE | NOT_RUN
  result_summary      TEXT,
  executed_at         TIMESTAMPTZ,
  evidence_ids        JSONB NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_se_plan ON startup_experiment (workspace_id, plan_id);

-- ─── StartupBusinessModelVersion ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_business_model_version (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               UUID NOT NULL,
  session_id                 UUID NOT NULL,
  idea_id                    UUID NOT NULL,
  version_number             INT  NOT NULL DEFAULT 1,
  customer_segment           TEXT NOT NULL,
  customer_problem           TEXT NOT NULL,
  value_proposition          TEXT NOT NULL,
  delivery_method            TEXT NOT NULL,
  revenue_model              TEXT NOT NULL,
  pricing_hypothesis         TEXT NOT NULL,
  cost_structure             JSONB NOT NULL DEFAULT '{}',
  acquisition_channels       JSONB NOT NULL DEFAULT '[]',
  key_metrics                JSONB NOT NULL DEFAULT '[]',
  regulatory_requirements    JSONB NOT NULL DEFAULT '[]',
  failure_modes              JSONB NOT NULL DEFAULT '[]',
  superseded_by_id           UUID,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                 UUID NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sbmv_idea_version ON startup_business_model_version (idea_id, version_number);
CREATE INDEX IF NOT EXISTS idx_sbmv_workspace_session ON startup_business_model_version (workspace_id, session_id);

-- ─── StartupEconomicModel ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_economic_model (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL,
  session_id                UUID NOT NULL,
  idea_id                   UUID NOT NULL,
  version_number            INT  NOT NULL DEFAULT 1,
  startup_cost_cents        BIGINT,
  fixed_monthly_cost_cents  BIGINT,
  variable_unit_cost_cents  BIGINT,
  price_per_unit_cents      BIGINT,
  gross_margin_bps          INT,   -- basis points
  cac_cents                 BIGINT,
  working_capital_cents     BIGINT,
  payment_delay_days        INT,
  break_even_volume         INT,
  break_even_months         INT,
  cash_runway_months        INT,
  min_viable_capacity       INT,
  max_current_capacity      INT,
  owner_labour_hours_per_week INT,
  sensitivity_scenarios     JSONB NOT NULL DEFAULT '{}',
  economic_classification   TEXT,  -- VIABLE | MARGINAL | UNVIABLE | INSUFFICIENT_DATA
  binding_condition         TEXT,
  unknown_inputs            JSONB NOT NULL DEFAULT '[]',
  superseded_by_id          UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sem_idea_version ON startup_economic_model (idea_id, version_number);
CREATE INDEX IF NOT EXISTS idx_sem_workspace_session ON startup_economic_model (workspace_id, session_id);

-- ─── StartupMarketSizing ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_market_sizing (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                  UUID NOT NULL,
  session_id                    UUID NOT NULL,
  idea_id                       UUID NOT NULL,
  reachable_market_units        BIGINT,
  reachable_market_revenue_cents BIGINT,
  serviceable_units             BIGINT,
  serviceable_revenue_cents     BIGINT,
  initial_customer_pool         INT,
  capacity_limited_revenue_cents BIGINT,
  sizing_status                 TEXT NOT NULL DEFAULT 'ESTIMATED',  -- ESTIMATED | INSUFFICIENT_EVIDENCE
  confidence                    INT NOT NULL DEFAULT 50,
  assumptions                   JSONB NOT NULL DEFAULT '[]',
  evidence                      JSONB NOT NULL DEFAULT '[]',
  sizing_range                  JSONB NOT NULL DEFAULT '{}',
  version_number                INT NOT NULL DEFAULT 1,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                    UUID NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_idea_version ON startup_market_sizing (idea_id, version_number);
CREATE INDEX IF NOT EXISTS idx_sms_workspace_session ON startup_market_sizing (workspace_id, session_id);

-- ─── StartupReadinessAssessment ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_readiness_assessment (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL,
  session_id                UUID NOT NULL,
  idea_id                   UUID NOT NULL,
  problem_evidence_score    INT NOT NULL DEFAULT 0,
  customer_evidence_score   INT NOT NULL DEFAULT 0,
  wtp_evidence_score        INT NOT NULL DEFAULT 0,
  solution_feasibility_score INT NOT NULL DEFAULT 0,
  delivery_feasibility_score INT NOT NULL DEFAULT 0,
  economic_viability_score  INT NOT NULL DEFAULT 0,
  cash_survival_score       INT NOT NULL DEFAULT 0,
  resource_readiness_score  INT NOT NULL DEFAULT 0,
  regulatory_readiness_score INT NOT NULL DEFAULT 0,
  owner_capacity_score      INT NOT NULL DEFAULT 0,
  hard_gate_failures        JSONB NOT NULL DEFAULT '[]',
  passed_gates              JSONB NOT NULL DEFAULT '[]',
  failed_gates              JSONB NOT NULL DEFAULT '[]',
  evidence_gaps             JSONB NOT NULL DEFAULT '[]',
  binding_constraints       JSONB NOT NULL DEFAULT '[]',
  safe_next_step            TEXT,
  readiness_status          TEXT NOT NULL DEFAULT 'NOT_READY',  -- READY | CONDITIONALLY_READY | NOT_READY | BLOCKED
  assessed_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  assessed_by               UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sra_workspace_session ON startup_readiness_assessment (workspace_id, session_id);
CREATE INDEX IF NOT EXISTS idx_sra_idea ON startup_readiness_assessment (workspace_id, idea_id);

-- ─── StartupSystemRecommendation (snapshot — immutable) ──────────────────────

CREATE TABLE IF NOT EXISTS startup_system_recommendation (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  session_id        UUID NOT NULL,
  idea_id           UUID,
  recommendation    TEXT NOT NULL,  -- GO | MODIFY | HOLD | REJECT | MORE_VALIDATION_REQUIRED
  rationale         TEXT NOT NULL,
  input_snapshot    JSONB NOT NULL,  -- snapshot of all inputs used (profile, economics, readiness, arbitration)
  confidence        INT NOT NULL DEFAULT 50,
  alternative_ideas JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_engine TEXT NOT NULL DEFAULT 'deterministic'
);

CREATE INDEX IF NOT EXISTS idx_ssr_workspace_session ON startup_system_recommendation (workspace_id, session_id);

-- ─── StartupOwnerDecision (immutable, versioned) ─────────────────────────────

CREATE TABLE IF NOT EXISTS startup_owner_decision (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL,
  session_id                UUID NOT NULL,
  idea_id                   UUID,
  decision_type             TEXT NOT NULL,  -- GO | MODIFY | HOLD | REJECT | REQUEST_MORE_EVIDENCE
  rationale                 TEXT,
  actor_id                  UUID NOT NULL,
  spending_limit_cents      BIGINT,
  permitted_actions         JSONB NOT NULL DEFAULT '[]',
  prohibited_actions        JSONB NOT NULL DEFAULT '[]',
  valid_until               TIMESTAMPTZ,
  review_date               TIMESTAMPTZ,
  material_assumptions      JSONB NOT NULL DEFAULT '[]',
  linked_system_rec_id      UUID,
  linked_profile_version_id UUID,
  linked_economic_model_id  UUID,
  linked_readiness_id       UUID,
  superseded_by_id          UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sod_workspace_session ON startup_owner_decision (workspace_id, session_id);
CREATE INDEX IF NOT EXISTS idx_sod_idea ON startup_owner_decision (workspace_id, idea_id);

-- ─── StartupResearchPlan ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_research_plan (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL,
  session_id           UUID NOT NULL,
  evidence_domains     JSONB NOT NULL DEFAULT '[]',
  completeness_report  JSONB NOT NULL DEFAULT '{}',
  acquired_domains     JSONB NOT NULL DEFAULT '[]',
  material_gaps        JSONB NOT NULL DEFAULT '[]',
  approved_by_owner    BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_srp_session ON startup_research_plan (session_id);
CREATE INDEX IF NOT EXISTS idx_srp_workspace ON startup_research_plan (workspace_id);

-- ─── StartupResearchAcquisition ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_research_acquisition (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL,
  research_plan_id         UUID NOT NULL,
  domain                   TEXT NOT NULL,
  source_url               TEXT,
  source_type              TEXT NOT NULL,
  query_method             TEXT NOT NULL,
  raw_result               TEXT,
  extracted_facts          JSONB NOT NULL DEFAULT '[]',
  retrieved_at             TIMESTAMPTZ,
  geography                TEXT,
  reliability_classification TEXT,
  confidence               INT NOT NULL DEFAULT 0,
  limitations              TEXT,
  status                   TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | ACQUIRED | FAILED | REQUIRES_OWNER
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sra2_workspace_plan ON startup_research_acquisition (workspace_id, research_plan_id);

-- ─── StartupExecutionBlueprint ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS startup_execution_blueprint (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL,
  session_id            UUID NOT NULL,
  idea_id               UUID NOT NULL,
  owner_decision_id     UUID NOT NULL,
  objective_id          UUID,    -- → BusinessObjective
  task_ids              JSONB NOT NULL DEFAULT '[]',
  kpi_ids               JSONB NOT NULL DEFAULT '[]',
  risk_ids              JSONB NOT NULL DEFAULT '[]',
  blueprint_status      TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | ACTIVE | SUPERSEDED
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seb_session_idea ON startup_execution_blueprint (session_id, idea_id) WHERE blueprint_status != 'SUPERSEDED';
CREATE INDEX IF NOT EXISTS idx_seb_workspace_session ON startup_execution_blueprint (workspace_id, session_id);
