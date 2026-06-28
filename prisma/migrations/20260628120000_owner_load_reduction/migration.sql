-- Jarvis 360 Slice 4 — standing instructions + attention events. Additive (new tables).

CREATE TABLE IF NOT EXISTS "owner_standing_instruction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "allowed_action_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "forbidden_action_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "max_amount" DOUBLE PRECISION,
  "risk_class" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by_user_id" UUID NOT NULL,
  "valid_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_standing_instruction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_standing_instruction_workspace_id_scope_idx"
  ON "owner_standing_instruction" ("workspace_id", "scope");

CREATE TABLE IF NOT EXISTS "owner_attention_event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "owner_decision_required" BOOLEAN NOT NULL DEFAULT false,
  "handled_by_opsiq" BOOLEAN NOT NULL DEFAULT false,
  "source_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_attention_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_attention_event_workspace_id_created_at_idx"
  ON "owner_attention_event" ("workspace_id", "created_at");
