-- Add assessment score columns to recommendations table
ALTER TABLE "recommendations" ADD COLUMN "evidence_validation_score" INTEGER;
ALTER TABLE "recommendations" ADD COLUMN "reliability_level" TEXT;
ALTER TABLE "recommendations" ADD COLUMN "kpi_health_score" INTEGER;
ALTER TABLE "recommendations" ADD COLUMN "kpi_risk_level" TEXT;

-- Add indexes for filtering/sorting by assessment scores
CREATE INDEX "recommendations_evidence_validation_score_idx" ON "recommendations"("evidence_validation_score");
CREATE INDEX "recommendations_kpi_health_score_idx" ON "recommendations"("kpi_health_score");
