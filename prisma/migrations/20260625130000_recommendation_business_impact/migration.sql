-- Module 1 — RecommendationBusinessImpact governance assessment persistence.
-- Additive only; idempotent (IF NOT EXISTS) per repo convention. No FK (mirrors delegated_tasks).

-- CreateTable
CREATE TABLE IF NOT EXISTS "recommendation_business_impacts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recommendation_id" UUID NOT NULL,
    "lean_classification" TEXT NOT NULL,
    "evidence_confidence" TEXT NOT NULL,
    "assessment" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_business_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recommendation_business_impacts_workspace_id_recommendation__key" ON "recommendation_business_impacts"("workspace_id", "recommendation_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recommendation_business_impacts_workspace_id_idx" ON "recommendation_business_impacts"("workspace_id");
