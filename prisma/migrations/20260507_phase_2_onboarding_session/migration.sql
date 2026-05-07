-- Phase 2 Slice 12B: OnboardingSession
-- Quick-start context delivery for operators

CREATE TABLE "onboarding_sessions" (
  "id" UUID NOT NULL,
  "engagement_id" UUID NOT NULL,
  "operator_id" UUID NOT NULL,
  "context_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "quick_start_context_snapshot" JSONB NOT NULL,
  "prepared_context" TEXT,
  "key_recommendation_pointers" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "emergency_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "delivered_at" TIMESTAMP(3),
  "viewed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "notes" TEXT,
  "prepared_by" UUID,
  "prepared_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "onboarding_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_sessions_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "onboarding_sessions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "onboarding_sessions_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "onboarding_sessions_engagement_id_idx" ON "onboarding_sessions"("engagement_id");
CREATE INDEX "onboarding_sessions_operator_id_idx" ON "onboarding_sessions"("operator_id");
CREATE INDEX "onboarding_sessions_status_idx" ON "onboarding_sessions"("status");
CREATE INDEX "onboarding_sessions_expires_at_idx" ON "onboarding_sessions"("expires_at");
