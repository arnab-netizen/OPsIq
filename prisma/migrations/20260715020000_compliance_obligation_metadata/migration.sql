-- Compliance obligation provenance and metadata fields
-- Extends owner_compliance_item with jurisdiction, legalBasis, obligationOwner,
-- evidenceValidityDays, recurrenceMonths, penaltyDescription, provenanceSource.
-- All columns are nullable so existing records are not affected.

ALTER TABLE "owner_compliance_item"
  ADD COLUMN IF NOT EXISTS "jurisdiction"           TEXT,
  ADD COLUMN IF NOT EXISTS "legal_basis"            TEXT,
  ADD COLUMN IF NOT EXISTS "obligation_owner"       TEXT,
  ADD COLUMN IF NOT EXISTS "evidence_validity_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "recurrence_months"      INTEGER,
  ADD COLUMN IF NOT EXISTS "penalty_description"    TEXT,
  ADD COLUMN IF NOT EXISTS "provenance_source"      TEXT;
