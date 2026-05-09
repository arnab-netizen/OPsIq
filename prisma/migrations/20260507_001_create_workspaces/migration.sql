-- Create workspaces table first (must run before any FK references)
-- This migration ensures workspaces exists before add_workspace_id_to_engagements and other migrations reference it

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Step 1: Create Workspace table
CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create unique index on workspace slug
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_key"
ON "workspaces"("slug");

-- Step 3: Create WorkspaceMembership table
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

-- Step 4: Create indexes on workspace_memberships
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_memberships_workspace_id_user_id_key"
ON "workspace_memberships"("workspace_id", "user_id");

CREATE INDEX IF NOT EXISTS "workspace_memberships_workspace_id_is_active_idx"
ON "workspace_memberships"("workspace_id", "is_active");

CREATE INDEX IF NOT EXISTS "workspace_memberships_user_id_is_active_idx"
ON "workspace_memberships"("user_id", "is_active");