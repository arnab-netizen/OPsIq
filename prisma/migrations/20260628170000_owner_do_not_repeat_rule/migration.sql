-- Jarvis 360 Slice 12 — dedicated do-not-repeat rule store. Additive (new table).
-- Self-contained: does not touch the schema-only OwnerDecisionMemory model (which
-- has no creating migration in the repo).
CREATE TABLE IF NOT EXISTS "owner_do_not_repeat_rule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "business_id" UUID,
  "memory_key" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "blocks_repetition" BOOLEAN NOT NULL DEFAULT true,
  "changed_context_explanation" TEXT,
  "recommendation_id" UUID,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_do_not_repeat_rule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_do_not_repeat_rule_ws_key_idx"
  ON "owner_do_not_repeat_rule" ("workspace_id", "memory_key");
