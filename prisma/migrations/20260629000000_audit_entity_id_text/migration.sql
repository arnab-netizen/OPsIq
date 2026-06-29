-- Defect 1 (pre-training baseline hardening): the owner approval-resolution flow returned HTTP 500
-- (PrismaClientKnownRequestError P2007: invalid input syntax for type uuid) because
-- audit_events.entity_id was typed uuid, but entity_id is a GENERIC identifier for the audited
-- entity — many audited entities use composite/string keys (e.g. "scope:hash", attention event
-- types like "approval.owner_decision_required", "system-run", "queue"). entity_id is NOT a uuid
-- foreign key (only actor_id references users). Constraining it to uuid turned every such audit
-- write into a 500. Widen it to text; existing uuid values cast cleanly and the
-- (entity_type, entity_id) index is preserved.
ALTER TABLE "audit_events" ALTER COLUMN "entity_id" TYPE text USING "entity_id"::text;
