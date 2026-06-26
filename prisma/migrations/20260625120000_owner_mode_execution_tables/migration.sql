-- Owner Mode guided-execution persistence (Slices 7/8/9) + Slice 3B employee profile fields.
-- Additive only: new tables + new nullable/defaulted columns on workspace_memberships.
-- Idempotent (IF NOT EXISTS) per repo convention.

-- AlterTable
ALTER TABLE "workspace_memberships" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "allowed_task_types" TEXT[],
ADD COLUMN IF NOT EXISTS "authority_limits" JSONB,
ADD COLUMN IF NOT EXISTS "created_by_owner_id" UUID,
ADD COLUMN IF NOT EXISTS "designation" TEXT,
ADD COLUMN IF NOT EXISTS "invitation_status" TEXT DEFAULT 'NOT_SENT',
ADD COLUMN IF NOT EXISTS "invited_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "manager_id" UUID,
ADD COLUMN IF NOT EXISTS "offboarded_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "primary_auth_method" TEXT,
ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "work_orders" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "delegated_tasks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "work_order_id" UUID,
    "assigned_user_id" UUID,
    "assigned_role" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT,
    "due_at" TIMESTAMP(3),
    "estimated_duration_min" INTEGER,
    "effort_level" TEXT,
    "requires_travel" BOOLEAN NOT NULL DEFAULT false,
    "requires_customer_interaction" BOOLEAN NOT NULL DEFAULT false,
    "requires_manager_review" BOOLEAN NOT NULL DEFAULT false,
    "approved_boundary_id" UUID,
    "approved_boundary_version" INTEGER,
    "boundary_content_hash" TEXT,
    "proof_requirement_id" UUID,
    "expected_outcome_id" UUID,
    "financial_boundary_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegated_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "task_status_history" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "proof_requirements" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID,
    "proof_type" TEXT NOT NULL,
    "required_fields" JSONB,
    "risk_level" TEXT NOT NULL DEFAULT 'LOW',
    "reviewer_role" TEXT,
    "owner_override_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "proofs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID,
    "proof_requirement_id" UUID,
    "proof_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUIRED',
    "submitted_by_user_id" UUID,
    "file_hash" TEXT,
    "duplicate_flagged" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "review_reason" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "resubmission_of_id" UUID,
    "owner_override_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "escalations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "assigned_target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by" UUID,
    "due_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_orders_workspace_id_idx" ON "work_orders"("workspace_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "delegated_tasks_workspace_id_status_idx" ON "delegated_tasks"("workspace_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "delegated_tasks_workspace_id_assigned_user_id_idx" ON "delegated_tasks"("workspace_id", "assigned_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "task_status_history_workspace_id_task_id_idx" ON "task_status_history"("workspace_id", "task_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "proof_requirements_workspace_id_idx" ON "proof_requirements"("workspace_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "proofs_workspace_id_status_idx" ON "proofs"("workspace_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "proofs_workspace_id_file_hash_idx" ON "proofs"("workspace_id", "file_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "escalations_workspace_id_status_idx" ON "escalations"("workspace_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "escalations_workspace_id_assigned_target_idx" ON "escalations"("workspace_id", "assigned_target");
