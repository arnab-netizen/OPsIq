-- Capability 13: Startup / New Business Mode session persistence
-- Creates owner_startup_session and startup_idea_record tables.

CREATE TABLE IF NOT EXISTS "owner_startup_session" (
  "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       UUID        NOT NULL,
  "actor_id"           UUID        NOT NULL,
  "session_label"      TEXT,
  "intake"             JSONB       NOT NULL DEFAULT '{}',
  "status"             TEXT        NOT NULL DEFAULT 'ACTIVE',
  "validation_result"  JSONB,
  "recommended_name"   TEXT,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "owner_startup_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_startup_session_workspace_id_status_idx"
  ON "owner_startup_session"("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "startup_idea_record" (
  "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
  "session_id"          UUID        NOT NULL,
  "workspace_id"        UUID        NOT NULL,
  "name"                TEXT        NOT NULL,
  "industry"            TEXT        NOT NULL,
  "accepted"            BOOLEAN     NOT NULL DEFAULT false,
  "capital_sufficient"  BOOLEAN,
  "capital_gap"         DOUBLE PRECISION,
  "monthly_profit"      DOUBLE PRECISION,
  "risk_adjusted_score" DOUBLE PRECISION,
  "reasons"             JSONB       NOT NULL DEFAULT '[]',
  "warnings"            JSONB       NOT NULL DEFAULT '[]',
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "startup_idea_record_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "startup_idea_record_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "owner_startup_session"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "startup_idea_record_workspace_id_session_id_idx"
  ON "startup_idea_record"("workspace_id", "session_id");
