-- HIGH-3: Add server-side outcome window anchor to ControlledLearningCandidate.
-- Nullable: existing rows have no outcome timestamp; admission service blocks if null.
ALTER TABLE "controlled_learning_candidates"
  ADD COLUMN IF NOT EXISTS "outcomeRecordedAt" TIMESTAMP(3);
