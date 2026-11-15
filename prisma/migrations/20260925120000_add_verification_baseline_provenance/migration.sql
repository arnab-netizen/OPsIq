-- Additive, nullable: records where a domain verification's before-value came from
-- (MEASURED by the diagnosis vs OWNER_REPORTED) and the measured value at the time.
-- Existing rows keep NULL (provenance not recorded). No data rewrite.
ALTER TABLE "owner_finance_verifications" ADD COLUMN "baseline_source" TEXT, ADD COLUMN "measured_before_value" DOUBLE PRECISION;
ALTER TABLE "owner_cashflow_verifications" ADD COLUMN "baseline_source" TEXT, ADD COLUMN "measured_before_value" DOUBLE PRECISION;
ALTER TABLE "owner_operations_verifications" ADD COLUMN "baseline_source" TEXT, ADD COLUMN "measured_before_value" DOUBLE PRECISION;
ALTER TABLE "owner_marketing_verifications" ADD COLUMN "baseline_source" TEXT, ADD COLUMN "measured_before_value" DOUBLE PRECISION;
ALTER TABLE "owner_strategy_verifications" ADD COLUMN "baseline_source" TEXT, ADD COLUMN "measured_before_value" DOUBLE PRECISION;
ALTER TABLE "owner_sop_verifications" ADD COLUMN "baseline_source" TEXT, ADD COLUMN "measured_before_value" DOUBLE PRECISION;
ALTER TABLE "owner_sales_verifications" ADD COLUMN "baseline_source" TEXT, ADD COLUMN "measured_before_value" DOUBLE PRECISION;
