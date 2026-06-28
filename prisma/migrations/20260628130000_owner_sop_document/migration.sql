-- Jarvis 360 Slice 5 — SOP document lifecycle. Additive (new table).
CREATE TABLE IF NOT EXISTS "owner_sop_document" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "business_id" UUID,
  "process" TEXT NOT NULL,
  "role" TEXT,
  "title" TEXT NOT NULL,
  "steps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "proof_requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "content_hash" TEXT NOT NULL,
  "approved_by_user_id" UUID,
  "effective_date" TIMESTAMP(3),
  "review_date" TIMESTAMP(3),
  "supersedes_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_sop_document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_sop_document_workspace_id_process_status_idx"
  ON "owner_sop_document" ("workspace_id", "process", "status");
