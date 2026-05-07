-- Create CustomerProfile table for Phase 2
-- Captures customer concentration, churn, satisfaction, and health constraints
CREATE TABLE "customer_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "engagement_id" UUID NOT NULL UNIQUE,
  "total_customers" INTEGER,
  "active_customers" INTEGER,
  "top_customer_percent_of_revenue" INTEGER,
  "top_3_customers_percent_of_revenue" INTEGER,
  "top_10_customers_percent_of_revenue" INTEGER,
  "customer_concentration_risk" VARCHAR(255) NOT NULL DEFAULT 'medium',
  "average_customer_lifetime_months" INTEGER,
  "average_customer_ltv" INTEGER,
  "customer_churn_rate_monthly" FLOAT,
  "customer_acquisition_cost_months" INTEGER,
  "customer_satisfaction_score" INTEGER,
  "nps_score" INTEGER,
  "customer_health_status" VARCHAR(255) NOT NULL DEFAULT 'healthy',
  "high_risk_customer_count" INTEGER,
  "contractual_commitment_months" INTEGER,
  "recurring_vs_one_time_percentage" INTEGER,
  "key_customer_dependency" BOOLEAN NOT NULL DEFAULT false,
  "key_customer_names" TEXT,
  "customer_segmentation_present" BOOLEAN NOT NULL DEFAULT false,
  "assessed_by" UUID,
  "assessed_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_profiles_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create index for engagement_id lookup
CREATE INDEX "customer_profiles_engagement_id_idx" ON "customer_profiles"("engagement_id");
