-- Jarvis 360 Slice 6 — staff skills matrix + observed-gap training. Additive.
CREATE TABLE IF NOT EXISTS "owner_staff_skill" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "staff_ref" TEXT NOT NULL,
  "role" TEXT,
  "skill" TEXT NOT NULL,
  "proven" BOOLEAN NOT NULL DEFAULT false,
  "sop_id" UUID,
  "equipment_authorized" BOOLEAN NOT NULL DEFAULT false,
  "last_proven_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_staff_skill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "owner_staff_skill_ws_staff_skill_key" ON "owner_staff_skill" ("workspace_id","staff_ref","skill");
CREATE INDEX IF NOT EXISTS "owner_staff_skill_ws_staff_idx" ON "owner_staff_skill" ("workspace_id","staff_ref");

CREATE TABLE IF NOT EXISTS "owner_training_recommendation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "staff_ref" TEXT NOT NULL,
  "reason_code" TEXT NOT NULL,
  "evidence_ref" TEXT,
  "process_affected" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "expected_improvement" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'recommended',
  "proof_of_completion" TEXT,
  "recheck_date" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_training_recommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_training_recommendation_ws_staff_idx" ON "owner_training_recommendation" ("workspace_id","staff_ref");
