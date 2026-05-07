-- Phase 1: Evidence Reliability Fields
-- Add weighted evidence scoring fields for EvidenceReliabilityEngine

ALTER TABLE evidence ADD COLUMN reliability_score DOUBLE PRECISION;
ALTER TABLE evidence ADD COLUMN freshness_score DOUBLE PRECISION;
ALTER TABLE evidence ADD COLUMN observed_at TIMESTAMP(3);
ALTER TABLE evidence ADD COLUMN ingested_at TIMESTAMP(3);

-- Set default values for existing records
UPDATE evidence SET reliability_score = 0.5 WHERE reliability_score IS NULL;
UPDATE evidence SET freshness_score = 0.5 WHERE freshness_score IS NULL;
UPDATE evidence SET observed_at = created_at WHERE observed_at IS NULL;
UPDATE evidence SET ingested_at = created_at WHERE ingested_at IS NULL;

-- Create index for reliability-based queries
CREATE INDEX "evidence_reliability_score_idx" ON evidence(reliability_score);
CREATE INDEX "evidence_freshness_score_idx" ON evidence(freshness_score);
