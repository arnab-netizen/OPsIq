-- Phase 5 Closure: execution plan governance fields + idea generation batch persistence

-- G4: Add governance fields to startup_execution_plans
ALTER TABLE "startup_execution_plans"
  ADD COLUMN IF NOT EXISTS "start_date"           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "target_date"           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "spending_limit_cents"  BIGINT,
  ADD COLUMN IF NOT EXISTS "stop_conditions"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "rollback_conditions"   JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "approval_package_hash" TEXT;

-- G6: StartupIdeaGenerationBatch — persists NEED_OPTIONS generated candidates with full provenance
CREATE TABLE IF NOT EXISTS "startup_idea_generation_batches" (
  "id"                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id"        UUID        NOT NULL,
  "session_id"          UUID        NOT NULL,
  "generation_method"   TEXT        NOT NULL,   -- DOMAIN_HEURISTIC | PROVIDER | STATIC_STUB
  "provider_status"     TEXT        NOT NULL,   -- NEED_OPTIONS_PROVIDER_AVAILABLE | NEED_OPTIONS_PRODUCTION_PROVIDER_UNAVAILABLE
  "profile_snapshot"    JSONB       NOT NULL DEFAULT '{}',  -- GenerationProfile at time of generation
  "evidence_count"      INTEGER     NOT NULL DEFAULT 0,
  "concepts"            JSONB       NOT NULL DEFAULT '[]',  -- IdeaGenerationConcept[]
  "concept_count"       INTEGER     NOT NULL DEFAULT 0,
  "available"           BOOLEAN     NOT NULL DEFAULT false, -- whether production provider was used
  "created_by"          UUID        NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "startup_idea_generation_batches_workspace_session_idx"
  ON "startup_idea_generation_batches" ("workspace_id", "session_id");

CREATE INDEX IF NOT EXISTS "startup_idea_generation_batches_created_at_idx"
  ON "startup_idea_generation_batches" ("workspace_id", "session_id", "created_at" DESC);

-- G6b: StartupIdeaCandidate — individual accepted/rejected candidate from a batch
CREATE TABLE IF NOT EXISTS "startup_idea_candidates" (
  "id"                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id"        UUID        NOT NULL,
  "session_id"          UUID        NOT NULL,
  "batch_id"            UUID        NOT NULL REFERENCES "startup_idea_generation_batches"("id") ON DELETE CASCADE,
  "concept_index"       INTEGER     NOT NULL,   -- index into batch.concepts[]
  "concept_snapshot"    JSONB       NOT NULL DEFAULT '{}',  -- IdeaGenerationConcept at time of decision
  "decision"            TEXT        NOT NULL,   -- ACCEPTED | REJECTED | PENDING
  "rejection_rationale" TEXT,
  "accepted_idea_id"    UUID,                   -- FK → startup_idea_records.id when accepted
  "decided_by"          UUID        NOT NULL,
  "decided_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "startup_idea_candidates_batch_concept_idx"
  ON "startup_idea_candidates" ("batch_id", "concept_index");

CREATE INDEX IF NOT EXISTS "startup_idea_candidates_session_idx"
  ON "startup_idea_candidates" ("workspace_id", "session_id");

CREATE INDEX IF NOT EXISTS "startup_idea_candidates_accepted_idea_idx"
  ON "startup_idea_candidates" ("accepted_idea_id") WHERE "accepted_idea_id" IS NOT NULL;
