-- Create RecommendationLifecycle table for Phase 2 Slice 9
-- Manages recommendation expiration and state transitions

CREATE TABLE "recommendation_lifecycles" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "recommendation_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "expiry_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejected_by" UUID,
    "rejection_reason" TEXT,
    "accepted_at" TIMESTAMP(3),
    "accepted_by" UUID,
    "activated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_lifecycles_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations" ("id") ON DELETE CASCADE,
    CONSTRAINT "recommendation_lifecycles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE CASCADE,
    CONSTRAINT "recommendation_lifecycles_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users" ("id"),
    CONSTRAINT "recommendation_lifecycles_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users" ("id")
);

-- Create indexes for performance
CREATE INDEX "recommendation_lifecycles_recommendation_id_idx" ON "recommendation_lifecycles"("recommendation_id");
CREATE INDEX "recommendation_lifecycles_engagement_id_idx" ON "recommendation_lifecycles"("engagement_id");
CREATE INDEX "recommendation_lifecycles_status_idx" ON "recommendation_lifecycles"("status");
CREATE INDEX "recommendation_lifecycles_expires_at_idx" ON "recommendation_lifecycles"("expires_at");
CREATE INDEX "recommendation_lifecycles_is_active_idx" ON "recommendation_lifecycles"("is_active");
