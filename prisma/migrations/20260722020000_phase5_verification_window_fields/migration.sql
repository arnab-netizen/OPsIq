-- Phase 5 R-VW: Add derivation metadata fields to startup_verification_windows.
-- All columns nullable/defaulted — fully additive, no table rewrites.

ALTER TABLE "startup_verification_windows"
  ADD COLUMN IF NOT EXISTS "derivation_rationale" TEXT,
  ADD COLUMN IF NOT EXISTS "provisional" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "evidence_required" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "reassessment_trigger" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" INTEGER;
