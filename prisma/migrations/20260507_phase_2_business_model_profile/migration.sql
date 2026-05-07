-- Phase 2 Slice 12A: BusinessModelProfile
-- Support hybrid business model configurations

CREATE TABLE "business_model_profiles" (
  "id" UUID NOT NULL,
  "engagement_id" UUID NOT NULL,
  "primary_model" TEXT NOT NULL,
  "secondary_models" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "description" TEXT,
  "subscription_revenue_mix" DOUBLE PRECISION,
  "one_time_revenue_mix" DOUBLE PRECISION,
  "services_revenue_mix" DOUBLE PRECISION,
  "other_revenue_mix" DOUBLE PRECISION,
  "subscription_margin_mix" DOUBLE PRECISION,
  "one_time_margin_mix" DOUBLE PRECISION,
  "services_margin_mix" DOUBLE PRECISION,
  "delivery_modes" TEXT[] DEFAULT ARRAY['self_service']::TEXT[],
  "recurring_vs_one_time_percentage" DOUBLE PRECISION,
  "operational_complexity_score" INTEGER NOT NULL DEFAULT 5,
  "maturity_state" TEXT NOT NULL DEFAULT 'SURVIVAL',
  "notes" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "business_model_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_model_profiles_engagement_id_key" UNIQUE ("engagement_id"),
  CONSTRAINT "business_model_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "business_model_profiles_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "business_model_profiles_engagement_id_idx" ON "business_model_profiles"("engagement_id");
