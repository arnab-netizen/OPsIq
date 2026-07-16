-- Phase 5: Owner Goal + Trajectory Engine
-- Owner declares a financial goal; system computes trajectory and scores
-- recommendations by how many weeks each accelerates goal attainment.

CREATE TABLE IF NOT EXISTS "owner_goals" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    UUID        NOT NULL,
  "actor_id"        UUID        NOT NULL,
  "target_type"     TEXT        NOT NULL,
  "target_amount"   DOUBLE PRECISION NOT NULL,
  "target_currency" TEXT        NOT NULL DEFAULT 'USD',
  "target_date"     TIMESTAMPTZ NOT NULL,
  "baseline_amount" DOUBLE PRECISION,
  "baseline_date"   TIMESTAMPTZ,
  "status"          TEXT        NOT NULL DEFAULT 'ACTIVE',
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "owner_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_goals_workspace_id_status_idx"
  ON "owner_goals"("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "owner_goal_milestones" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "goal_id"        UUID        NOT NULL,
  "workspace_id"   UUID        NOT NULL,
  "description"    TEXT        NOT NULL,
  "target_amount"  DOUBLE PRECISION,
  "target_date"    TIMESTAMPTZ NOT NULL,
  "achieved_at"    TIMESTAMPTZ,
  "status"         TEXT        NOT NULL DEFAULT 'pending',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "owner_goal_milestones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "owner_goal_milestones_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "owner_goals"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "owner_goal_milestones_goal_id_idx"
  ON "owner_goal_milestones"("goal_id");

CREATE INDEX IF NOT EXISTS "owner_goal_milestones_workspace_id_idx"
  ON "owner_goal_milestones"("workspace_id");
