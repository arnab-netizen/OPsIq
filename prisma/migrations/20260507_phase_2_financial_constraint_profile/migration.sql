-- Create FinancialConstraintProfile table for Phase 2
-- Captures cash flow, debt, capital, and working capital constraints
CREATE TABLE "financial_constraint_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "engagement_id" UUID NOT NULL UNIQUE,
  "monthly_burn_rate" INTEGER,
  "monthly_recurring_revenue" INTEGER,
  "cash_runway_months" INTEGER,
  "total_debt" INTEGER,
  "debt_service_monthly" INTEGER,
  "debt_maturity_months" INTEGER,
  "equity_available" INTEGER,
  "working_capital_days_of_payables" INTEGER,
  "working_capital_days_of_receivables" INTEGER,
  "seasonality_pattern" VARCHAR(255),
  "restricted_cash" INTEGER,
  "contingency_reserve_months" INTEGER,
  "major_capex_needed" BOOLEAN NOT NULL DEFAULT false,
  "capex_estimated_amount" INTEGER,
  "capex_timeline_months" INTEGER,
  "loan_covenants_present" BOOLEAN NOT NULL DEFAULT false,
  "covenant_details" TEXT,
  "investor_dilution_threshold" FLOAT,
  "profitability_target_months" INTEGER,
  "financial_health_status" VARCHAR(255) NOT NULL DEFAULT 'adequate',
  "cash_flow_timing" VARCHAR(255) NOT NULL DEFAULT 'monthly',
  "assessed_by" UUID,
  "assessed_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "financial_constraint_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_constraint_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "financial_constraint_profiles_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create index for engagement_id lookup
CREATE INDEX "financial_constraint_profiles_engagement_id_idx" ON "financial_constraint_profiles"("engagement_id");
