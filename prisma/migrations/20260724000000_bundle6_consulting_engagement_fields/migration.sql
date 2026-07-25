-- Bundle 6: Consulting Mode — Add consulting lifecycle fields to engagements table.
-- These three columns model the 4th OpsIQ dimension (human execution reality via humanFactors)
-- and the consulting phase FSM (DISCOVERY → DIAGNOSIS → IMPLEMENTATION → REVIEW).
-- All nullable or have defaults; additive only; no existing rows affected.

ALTER TABLE "engagements" ADD COLUMN "consulting_phase" TEXT NOT NULL DEFAULT 'DISCOVERY';
ALTER TABLE "engagements" ADD COLUMN "consultant_notes" TEXT;
ALTER TABLE "engagements" ADD COLUMN "human_factors" JSONB;
