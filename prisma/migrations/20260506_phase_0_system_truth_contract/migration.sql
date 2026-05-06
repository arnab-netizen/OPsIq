-- Phase 0 — System Truth Contract
-- Add fields to Recommendation model for RecommendationTruthContract validation

ALTER TABLE "recommendations" ADD COLUMN "rollback_plan" TEXT;
ALTER TABLE "recommendations" ADD COLUMN "constraints_considered" JSONB;
ALTER TABLE "recommendations" ADD COLUMN "confidence_level" TEXT;
ALTER TABLE "recommendations" ADD COLUMN "expires_at" TIMESTAMP(3);
ALTER TABLE "recommendations" ADD COLUMN "is_ai_proposal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "recommendations" ADD COLUMN "created_by" UUID;

-- Add index for expiration enforcement
CREATE INDEX "recommendations_expires_at_idx" ON "recommendations"("expires_at");
CREATE INDEX "recommendations_is_ai_proposal_idx" ON "recommendations"("is_ai_proposal");

-- Add foreign key for creator
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AIProposalSandbox model: Phase 0 AI containment
CREATE TABLE "ai_proposal_sandboxes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "recommendation_id" UUID NOT NULL,
  "source_model" TEXT NOT NULL,
  "confidence_level" TEXT NOT NULL,
  "is_approved" BOOLEAN NOT NULL DEFAULT false,
  "approved_by" UUID,
  "approved_at" TIMESTAMP(3),
  "rejected_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_proposal_sandboxes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_proposal_sandboxes_workspace_id_idx" ON "ai_proposal_sandboxes"("workspace_id");
CREATE INDEX "ai_proposal_sandboxes_recommendation_id_idx" ON "ai_proposal_sandboxes"("recommendation_id");
CREATE INDEX "ai_proposal_sandboxes_source_model_idx" ON "ai_proposal_sandboxes"("source_model");
CREATE INDEX "ai_proposal_sandboxes_is_approved_idx" ON "ai_proposal_sandboxes"("is_approved");

-- RecommendationExpiryPolicy model: Phase 0 expiration enforcement
CREATE TABLE "recommendation_expiry_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "recommendation_id" UUID NOT NULL UNIQUE,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "expired_at" TIMESTAMP(3),
  "reason" TEXT,
  "replaced_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "recommendation_expiry_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendation_expiry_policies_workspace_id_idx" ON "recommendation_expiry_policies"("workspace_id");
CREATE INDEX "recommendation_expiry_policies_expires_at_idx" ON "recommendation_expiry_policies"("expires_at");
CREATE INDEX "recommendation_expiry_policies_status_idx" ON "recommendation_expiry_policies"("status");
