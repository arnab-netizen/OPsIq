-- Create ResourceBudget table for Phase 2 Slice 10
-- Tracks and enforces resource allocation budgets

CREATE TABLE "resource_budgets" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "description" TEXT,
    "total_budget" DOUBLE PRECISION NOT NULL,
    "allocated_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "committed_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumed_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "warning_threshold" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "status" TEXT NOT NULL DEFAULT 'available',
    "is_blocking" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_budgets_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE CASCADE,
    CONSTRAINT "resource_budgets_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id")
);

-- Create indexes for performance
CREATE INDEX "resource_budgets_engagement_id_idx" ON "resource_budgets"("engagement_id");
CREATE INDEX "resource_budgets_resource_type_idx" ON "resource_budgets"("resource_type");
CREATE INDEX "resource_budgets_status_idx" ON "resource_budgets"("status");
