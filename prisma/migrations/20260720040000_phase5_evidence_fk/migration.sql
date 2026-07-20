-- Phase 5: Add missing FK constraint on startup_evidence_record.session_id.
-- The Prisma schema declares the relation but the original migration omitted the REFERENCES clause.
-- This constraint ensures evidence inserted for a non-existent session is rejected at the DB level,
-- which is required for the audit-rollback concurrency test.

ALTER TABLE startup_evidence_record
  ADD CONSTRAINT fk_ser_session
  FOREIGN KEY (session_id) REFERENCES owner_startup_session(id) ON DELETE CASCADE;
