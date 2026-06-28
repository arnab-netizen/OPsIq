-- GAP-DB-02 — protect governed verification (proof) records from silent cascade delete.
-- Deleting an OwnerBusiness or an owner-domain action must NOT silently destroy its validation
-- evidence; these FKs change ON DELETE CASCADE -> RESTRICT. Schema and migration kept consistent.

ALTER TABLE "owner_finance_verifications" DROP CONSTRAINT IF EXISTS "owner_finance_verifications_business_id_fkey";
ALTER TABLE "owner_finance_verifications" ADD CONSTRAINT "owner_finance_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_finance_verifications" DROP CONSTRAINT IF EXISTS "owner_finance_verifications_action_id_fkey";
ALTER TABLE "owner_finance_verifications" ADD CONSTRAINT "owner_finance_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_finance_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_cashflow_verifications" DROP CONSTRAINT IF EXISTS "owner_cashflow_verifications_business_id_fkey";
ALTER TABLE "owner_cashflow_verifications" ADD CONSTRAINT "owner_cashflow_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_cashflow_verifications" DROP CONSTRAINT IF EXISTS "owner_cashflow_verifications_action_id_fkey";
ALTER TABLE "owner_cashflow_verifications" ADD CONSTRAINT "owner_cashflow_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_cashflow_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_sales_verifications" DROP CONSTRAINT IF EXISTS "owner_sales_verifications_business_id_fkey";
ALTER TABLE "owner_sales_verifications" ADD CONSTRAINT "owner_sales_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_sales_verifications" DROP CONSTRAINT IF EXISTS "owner_sales_verifications_action_id_fkey";
ALTER TABLE "owner_sales_verifications" ADD CONSTRAINT "owner_sales_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_sales_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_operations_verifications" DROP CONSTRAINT IF EXISTS "owner_operations_verifications_business_id_fkey";
ALTER TABLE "owner_operations_verifications" ADD CONSTRAINT "owner_operations_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_operations_verifications" DROP CONSTRAINT IF EXISTS "owner_operations_verifications_action_id_fkey";
ALTER TABLE "owner_operations_verifications" ADD CONSTRAINT "owner_operations_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_operations_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_sop_verifications" DROP CONSTRAINT IF EXISTS "owner_sop_verifications_business_id_fkey";
ALTER TABLE "owner_sop_verifications" ADD CONSTRAINT "owner_sop_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_sop_verifications" DROP CONSTRAINT IF EXISTS "owner_sop_verifications_action_id_fkey";
ALTER TABLE "owner_sop_verifications" ADD CONSTRAINT "owner_sop_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_sop_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_marketing_verifications" DROP CONSTRAINT IF EXISTS "owner_marketing_verifications_business_id_fkey";
ALTER TABLE "owner_marketing_verifications" ADD CONSTRAINT "owner_marketing_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_marketing_verifications" DROP CONSTRAINT IF EXISTS "owner_marketing_verifications_action_id_fkey";
ALTER TABLE "owner_marketing_verifications" ADD CONSTRAINT "owner_marketing_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_marketing_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_strategy_verifications" DROP CONSTRAINT IF EXISTS "owner_strategy_verifications_business_id_fkey";
ALTER TABLE "owner_strategy_verifications" ADD CONSTRAINT "owner_strategy_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "owner_strategy_verifications" DROP CONSTRAINT IF EXISTS "owner_strategy_verifications_action_id_fkey";
ALTER TABLE "owner_strategy_verifications" ADD CONSTRAINT "owner_strategy_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_strategy_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
