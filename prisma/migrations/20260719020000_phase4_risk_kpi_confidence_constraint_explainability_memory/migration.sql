-- Phase 4: Business Risk Register, KPI Ownership, Decision Confidence Evolution,
--          Constraint Resolution, Explainability Layer, Operating Memory
-- All additive. No destructive operations.

-- ─── Business risk register ───────────────────────────────────────────────────

CREATE TABLE "business_risk_entries" (
  "id"                  UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        UUID      NOT NULL,
  "risk_code"           TEXT      NOT NULL,
  "title"               TEXT      NOT NULL,
  "description"         TEXT,
  "category"            TEXT      NOT NULL,
  "likelihood"          INTEGER   NOT NULL DEFAULT 50,
  "impact"              INTEGER   NOT NULL DEFAULT 50,
  "severity"            INTEGER   NOT NULL DEFAULT 50,
  "status"              TEXT      NOT NULL DEFAULT 'IDENTIFIED',
  "mitigation_action"   TEXT,
  "residual_risk"       INTEGER,
  "linked_objective_id" UUID,
  "reviewed_at"         TIMESTAMPTZ,
  "identified_by"       UUID      NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "business_risk_entries_pkey"   PRIMARY KEY ("id"),
  CONSTRAINT "bre_workspace_code_unique"    UNIQUE ("workspace_id", "risk_code")
);

CREATE INDEX "bre_workspace_status_idx"   ON "business_risk_entries" ("workspace_id", "status");
CREATE INDEX "bre_workspace_category_idx" ON "business_risk_entries" ("workspace_id", "category");
CREATE INDEX "bre_workspace_severity_idx" ON "business_risk_entries" ("workspace_id", "severity");

-- ─── KPI ownership ────────────────────────────────────────────────────────────

CREATE TABLE "kpi_ownership_records" (
  "id"                   UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         UUID      NOT NULL,
  "metric_name"          TEXT      NOT NULL,
  "metric_label"         TEXT      NOT NULL,
  "owner_user_id"        UUID      NOT NULL,
  "review_cadence"       TEXT      NOT NULL,
  "target_value"         DOUBLE PRECISION,
  "current_value"        DOUBLE PRECISION,
  "unit"                 TEXT,
  "linked_objective_id"  UUID,
  "last_reviewed_at"     TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "kpi_ownership_records_pkey"   PRIMARY KEY ("id"),
  CONSTRAINT "kor_workspace_metric_unique"  UNIQUE ("workspace_id", "metric_name")
);

CREATE INDEX "kor_workspace_owner_idx" ON "kpi_ownership_records" ("workspace_id", "owner_user_id");

-- ─── Decision confidence evolution ───────────────────────────────────────────

CREATE TABLE "decision_confidence_records" (
  "id"                UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      UUID      NOT NULL,
  "decision_ref"      TEXT      NOT NULL,
  "decision_type"     TEXT      NOT NULL,
  "confidence_score"  DOUBLE PRECISION NOT NULL,
  "confidence_level"  TEXT      NOT NULL,
  "evidence_count"    INTEGER   NOT NULL DEFAULT 0,
  "confidence_basis"  JSONB     NOT NULL,
  "recorded_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "decision_confidence_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dcr_workspace_ref_idx"      ON "decision_confidence_records" ("workspace_id", "decision_ref");
CREATE INDEX "dcr_workspace_type_at_idx"  ON "decision_confidence_records" ("workspace_id", "decision_type", "recorded_at");

-- ─── Constraint resolution lifecycle ─────────────────────────────────────────

CREATE TABLE "constraint_resolution_records" (
  "id"                   UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         UUID      NOT NULL,
  "constraint_type"      TEXT      NOT NULL,
  "constraint_source"    TEXT      NOT NULL,
  "title"                TEXT      NOT NULL,
  "binding_score"        DOUBLE PRECISION NOT NULL,
  "remediation_action"   TEXT,
  "status"               TEXT      NOT NULL DEFAULT 'ACTIVE',
  "linked_objective_id"  UUID,
  "identified_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "resolved_at"          TIMESTAMPTZ,
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "constraint_resolution_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crr_workspace_status_idx" ON "constraint_resolution_records" ("workspace_id", "status");
CREATE INDEX "crr_workspace_type_idx"   ON "constraint_resolution_records" ("workspace_id", "constraint_type");

-- ─── Explainability layer ─────────────────────────────────────────────────────

CREATE TABLE "explainability_records" (
  "id"                UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      UUID      NOT NULL,
  "decision_ref"      TEXT      NOT NULL,
  "decision_type"     TEXT      NOT NULL,
  "explanation_text"  TEXT      NOT NULL,
  "factors_used"      JSONB     NOT NULL,
  "data_points"       JSONB     NOT NULL,
  "confidence"        DOUBLE PRECISION NOT NULL,
  "confidence_level"  TEXT      NOT NULL,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "explainability_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "er_workspace_ref_idx"      ON "explainability_records" ("workspace_id", "decision_ref");
CREATE INDEX "er_workspace_type_at_idx"  ON "explainability_records" ("workspace_id", "decision_type", "created_at");

-- ─── Unified operating memory ─────────────────────────────────────────────────

CREATE TABLE "operating_memory_entries" (
  "id"            UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  UUID      NOT NULL,
  "memory_type"   TEXT      NOT NULL,
  "source_model"  TEXT      NOT NULL,
  "source_id"     TEXT      NOT NULL,
  "key"           TEXT      NOT NULL,
  "summary"       TEXT      NOT NULL,
  "data"          JSONB     NOT NULL DEFAULT '{}',
  "valid_until"   TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "operating_memory_entries_pkey"   PRIMARY KEY ("id"),
  CONSTRAINT "ome_workspace_type_source_unique" UNIQUE ("workspace_id", "memory_type", "source_id")
);

CREATE INDEX "ome_workspace_type_idx" ON "operating_memory_entries" ("workspace_id", "memory_type");
CREATE INDEX "ome_workspace_key_idx"  ON "operating_memory_entries" ("workspace_id", "key");
