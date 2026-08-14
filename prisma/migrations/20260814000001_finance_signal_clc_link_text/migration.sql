-- Migration: change learning_candidate_id column type from UUID to TEXT
-- Rationale: ControlledLearningCandidate.id uses @id @default(cuid()) which
-- produces cuid strings (text), not UUIDs. The @db.Uuid annotation on
-- OwnerFinanceOutcomeSignal.learningCandidateId caused the bridge backlink
-- update to fail silently (PostgreSQL rejected cuid values as invalid UUID),
-- leaving all signals with learningCandidateId=null and breaking the
-- governance eligibility gate.
-- Changing to TEXT allows cuid values from the bridge to be stored correctly
-- and enables the two-step eligibility gate in getFinanceEffectivenessMap
-- to actually find promoted CLCs.

ALTER TABLE "owner_finance_outcome_signals"
  ALTER COLUMN "learning_candidate_id" TYPE TEXT;
