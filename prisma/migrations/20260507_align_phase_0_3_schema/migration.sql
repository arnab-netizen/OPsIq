-- Align schema to Phase 0-3 requirements
-- This migration creates missing tables and adds missing columns

-- Step 1: Create Workspace table (Phase 0-3 addition)
CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create unique index on workspace slug
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_key" ON "workspaces"("slug");

-- Step 3: Create WorkspaceMembership table (Phase 0-3 addition)
CREATE TABLE IF NOT EXISTS "workspace_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "added_by" UUID,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

-- Step 4: Create unique index on workspace_memberships
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_memberships_workspace_id_user_id_key" ON "workspace_memberships"("workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "workspace_memberships_workspace_id_is_active_idx" ON "workspace_memberships"("workspace_id", "is_active");
CREATE INDEX IF NOT EXISTS "workspace_memberships_user_id_is_active_idx" ON "workspace_memberships"("user_id", "is_active");

-- Step 5: Add missing columns to recommendations table
ALTER TABLE "recommendations"
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "approved_by" UUID,
ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'internal',
ADD COLUMN IF NOT EXISTS "workspace_id" UUID;

-- Step 6: Create SnapshotData table
CREATE TABLE IF NOT EXISTS "snapshot_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "snapshot_version" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "event_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,

    CONSTRAINT "snapshot_data_pkey" PRIMARY KEY ("id")
);

-- Step 7: Create indexes for SnapshotData
CREATE UNIQUE INDEX IF NOT EXISTS "snapshot_data_aggregate_id_aggregate_type_workspace_id_key"
ON "snapshot_data"("aggregate_id", "aggregate_type", "workspace_id");
CREATE INDEX IF NOT EXISTS "snapshot_data_workspace_id_expires_at_idx"
ON "snapshot_data"("workspace_id", "expires_at");
CREATE INDEX IF NOT EXISTS "snapshot_data_created_at_idx" ON "snapshot_data"("created_at");

-- Step 8: Add columns to engagements table
ALTER TABLE "engagements"
ADD COLUMN IF NOT EXISTS "code" TEXT,
ADD COLUMN IF NOT EXISTS "workspace_id" UUID;

-- Step 9: Add foreign key constraints
DO $$
BEGIN
  -- recommendations → approved_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recommendations_approved_by_fkey'
  ) THEN
    ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- recommendations → workspace
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recommendations_workspace_id_fkey'
  ) THEN
    ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- snapshot_data → workspace
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'snapshot_data_workspace_id_fkey'
  ) THEN
    ALTER TABLE "snapshot_data"
    ADD CONSTRAINT "snapshot_data_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- engagements → workspace
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'engagements_workspace_id_fkey'
  ) THEN
    ALTER TABLE "engagements"
    ADD CONSTRAINT "engagements_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- workspace_memberships → workspace
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workspace_memberships_workspace_id_fkey'
  ) THEN
    ALTER TABLE "workspace_memberships"
    ADD CONSTRAINT "workspace_memberships_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- workspace_memberships → users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workspace_memberships_user_id_fkey'
  ) THEN
    ALTER TABLE "workspace_memberships"
    ADD CONSTRAINT "workspace_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
