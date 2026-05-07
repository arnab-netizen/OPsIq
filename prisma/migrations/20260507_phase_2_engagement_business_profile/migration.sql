-- Create EngagementBusinessProfile table for Phase 2
-- Captures engagement-specific business context (distinct from workspace-level BusinessProfile)
CREATE TABLE "engagement_business_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "engagement_id" UUID NOT NULL UNIQUE,
  "business_name" VARCHAR(255),
  "industry" VARCHAR(255),
  "business_model_type" VARCHAR(255),
  "maturity_state" VARCHAR(255) NOT NULL DEFAULT 'STABILIZE',
  "annual_revenue" INTEGER,
  "founding_year" INTEGER,
  "employee_count" INTEGER,
  "geo_focus" VARCHAR(255),
  "primary_service_or_product" TEXT,
  "secondary_services_or_products" TEXT,
  "revenue_recurring_percent" INTEGER,
  "margin_health_assessment" VARCHAR(255),
  "customer_concentration_level" VARCHAR(255),
  "operational_maturity_level" VARCHAR(255),
  "key_context" TEXT,
  "context_provided_at" TIMESTAMP(3),
  "context_provided_by" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "engagement_business_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "engagement_business_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "engagement_business_profiles_context_provided_by_fkey" FOREIGN KEY ("context_provided_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create index for engagement_id lookup
CREATE INDEX "engagement_business_profiles_engagement_id_idx" ON "engagement_business_profiles"("engagement_id");
