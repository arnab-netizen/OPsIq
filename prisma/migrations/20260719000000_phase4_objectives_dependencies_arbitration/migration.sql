-- Phase 4: Business Objective Hierarchy, Dependency Graph, Goal Arbitration
-- All additive. No destructive operations.

CREATE TABLE "business_objectives" (
  "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        UUID          NOT NULL,
  "parent_id"           UUID,
  "title"               TEXT          NOT NULL,
  "description"         TEXT,
  "objective_type"      TEXT          NOT NULL,
  "target_metric_name"  TEXT,
  "target_value"        DOUBLE PRECISION,
  "current_value"       DOUBLE PRECISION,
  "unit"                TEXT,
  "deadline"            TIMESTAMPTZ,
  "status"              TEXT          NOT NULL DEFAULT 'ACTIVE',
  "priority_score"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "resource_budget"     JSONB         NOT NULL DEFAULT '{}',
  "constraints"         JSONB         NOT NULL DEFAULT '[]',
  "owner_id"            UUID,
  "linked_goal_id"      UUID,
  "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT "business_objectives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_objectives_parent_fk"
    FOREIGN KEY ("parent_id") REFERENCES "business_objectives"("id") ON DELETE SET NULL
);

CREATE INDEX "business_objectives_workspace_status_idx"     ON "business_objectives" ("workspace_id", "status");
CREATE INDEX "business_objectives_workspace_type_idx"       ON "business_objectives" ("workspace_id", "objective_type");
CREATE INDEX "business_objectives_workspace_parent_idx"     ON "business_objectives" ("workspace_id", "parent_id");

-- ─── Dependency edges ────────────────────────────────────────────────────────

CREATE TABLE "business_objective_dependencies" (
  "id"            UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  UUID      NOT NULL,
  "blocking_id"   UUID      NOT NULL,
  "blocked_id"    UUID      NOT NULL,
  "dep_type"      TEXT      NOT NULL DEFAULT 'PREREQUISITE',
  "note"          TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "business_objective_dependencies_pkey"    PRIMARY KEY ("id"),
  CONSTRAINT "business_objective_dependencies_unique"  UNIQUE ("workspace_id", "blocking_id", "blocked_id"),
  CONSTRAINT "bod_blocking_fk" FOREIGN KEY ("blocking_id") REFERENCES "business_objectives"("id") ON DELETE CASCADE,
  CONSTRAINT "bod_blocked_fk"  FOREIGN KEY ("blocked_id")  REFERENCES "business_objectives"("id") ON DELETE CASCADE
);

CREATE INDEX "bod_workspace_blocked_idx" ON "business_objective_dependencies" ("workspace_id", "blocked_id");

-- ─── Goal arbitration records ─────────────────────────────────────────────────

CREATE TABLE "goal_arbitration_records" (
  "id"                   UUID      NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         UUID      NOT NULL,
  "candidate_ids"        JSONB     NOT NULL,
  "winner_objective_id"  UUID,
  "arbitration_result"   JSONB     NOT NULL,
  "dominant_constraint"  TEXT,
  "resource_conflict"    JSONB,
  "actor_id"             UUID      NOT NULL,
  "arbitrated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "goal_arbitration_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gar_workspace_at_idx"     ON "goal_arbitration_records" ("workspace_id", "arbitrated_at");
CREATE INDEX "gar_workspace_winner_idx" ON "goal_arbitration_records" ("workspace_id", "winner_objective_id");
