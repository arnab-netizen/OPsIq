-- Add interventionPhase column to engagements table
ALTER TABLE "engagements" ADD COLUMN "intervention_phase" TEXT NOT NULL DEFAULT 'assessment';
