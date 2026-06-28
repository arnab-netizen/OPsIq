-- Jarvis 360 Slice 4 — owner approval memory (content-hash reuse of owner approvals).
-- Additive: new table only, no change to existing tables.

CREATE TABLE IF NOT EXISTS "owner_approval_memory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "risk_class" TEXT NOT NULL,
  "approval_status" TEXT NOT NULL DEFAULT 'approved',
  "approved_by_user_id" UUID NOT NULL,
  "valid_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_approval_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "owner_approval_memory_workspace_id_scope_content_hash_key"
  ON "owner_approval_memory" ("workspace_id", "scope", "content_hash");
CREATE INDEX IF NOT EXISTS "owner_approval_memory_workspace_id_scope_idx"
  ON "owner_approval_memory" ("workspace_id", "scope");
