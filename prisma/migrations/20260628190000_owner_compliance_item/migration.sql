-- Jarvis 360 Slice 14 — compliance item with expiry. Additive (new table).
CREATE TABLE IF NOT EXISTS "owner_compliance_item" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "business_id" UUID,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "reference" TEXT,
  "expires_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_compliance_item_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_compliance_item_ws_kind_idx" ON "owner_compliance_item" ("workspace_id","kind");
