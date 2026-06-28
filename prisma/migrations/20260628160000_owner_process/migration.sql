-- Jarvis 360 Slice 8 — process inventory + review. Additive (new table).
CREATE TABLE IF NOT EXISTS "owner_process" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "business_id" UUID,
  "name" TEXT NOT NULL,
  "process_type" TEXT NOT NULL,
  "owner_role" TEXT NOT NULL,
  "sop_id" UUID,
  "metric" TEXT NOT NULL,
  "target" TEXT,
  "review_frequency_days" INTEGER NOT NULL DEFAULT 30,
  "last_review_at" TIMESTAMP(3),
  "next_review_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_process_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_process_ws_type_idx" ON "owner_process" ("workspace_id","process_type");
