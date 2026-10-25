-- QuickBooks Online / Intuit User Data — GOVERNED PRIVACY ERASURE (escape hatch).
--
-- Intuit Developer Terms require deleting User Data at the user's request. The ordinary runtime guarantees stay exactly as they were:
-- qbo_report_snapshots, qbo_canonical_provenance, owner_decision_records and owner_outcome_assessments remain append-only for every
-- session that is not running an APPROVED erasure request. This migration adds ONLY:
--   1. a NOLOGIN role `opsiq_privacy_eraser` (an administrator grants it to the operator login that runs the erasure script),
--   2. a tombstone / authorization table `privacy_erasure_requests` (no values, no realm ids, no company names),
--   3. `qbo_erasure_authorized(workspace, business)` — true only when ALL of: the session user is a member of the eraser role, the
--      transaction names a request id (opsiq.erasure_request_id), and that request is EXECUTING (set inside the erasing transaction
--      only after approval by a SECOND operator) for exactly this workspace + business,
--   4. the four existing guard functions, re-created so a DELETE (and, for the two append-only decision tables, a scoped UPDATE that
--      detaches a pointer) is allowed when — and only when — qbo_erasure_authorized() is true for the row's own workspace + business.
-- Every other path (UPDATE of provenance / observations, any session without the role, any other business) raises exactly as before.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opsiq_privacy_eraser') THEN
    CREATE ROLE opsiq_privacy_eraser NOLOGIN;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'opsiq_privacy_eraser was not created (insufficient privilege): governed erasure stays disabled (fail closed) until an administrator creates the role';
END $$;

CREATE TABLE "privacy_erasure_requests" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'QBO_INTUIT_DATA',
    "reason_code" TEXT NOT NULL,
    "privacy_request_id" UUID,
    "status" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "manifest_hash" TEXT,
    "dry_run_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "result_code" TEXT,
    "result_counts" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_erasure_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_erasure_requests_workspace_id_business_id_idx" ON "privacy_erasure_requests"("workspace_id", "business_id");
CREATE INDEX "privacy_erasure_requests_status_idx" ON "privacy_erasure_requests"("status");

ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_scope_check" CHECK ("scope" IN ('QBO_INTUIT_DATA'));
ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_reason_check" CHECK ("reason_code" IN ('USER_DATA_ERASURE_REQUEST', 'USER_REVOKED_CONSENT'));
ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_status_check" CHECK ("status" IN ('REQUESTED', 'DRY_RUN_RECORDED', 'APPROVED', 'EXECUTING', 'EXECUTED', 'REJECTED'));
-- Two-person rule: the approver is never the requester.
ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_two_person_check" CHECK ("approved_by" IS NULL OR "approved_by" <> "requested_by");
-- An erasure can only be approved / run against a recorded dry-run manifest by a named approver.
ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_approval_check" CHECK ("status" NOT IN ('APPROVED', 'EXECUTING', 'EXECUTED') OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL AND "manifest_hash" IS NOT NULL));

-- The tombstone is permanent: never deleted, identity never rewritten, an executed request never reopened.
CREATE FUNCTION privacy_erasure_requests_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'privacy_erasure_requests is a permanent tombstone and cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.workspace_id, NEW.business_id, NEW.scope, NEW.reason_code, NEW.requested_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.workspace_id, OLD.business_id, OLD.scope, OLD.reason_code, OLD.requested_by, OLD.created_at) THEN
    RAISE EXCEPTION 'privacy_erasure_requests identity columns are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'EXECUTED' AND NEW.status <> 'EXECUTED' THEN
    RAISE EXCEPTION 'an executed privacy erasure request cannot be reopened' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER privacy_erasure_requests_guard_trg BEFORE UPDATE OR DELETE ON "privacy_erasure_requests"
  FOR EACH ROW EXECUTE FUNCTION privacy_erasure_requests_guard();

-- The single authorization predicate. Fail closed on every branch.
CREATE FUNCTION qbo_erasure_authorized(p_workspace uuid, p_business uuid) RETURNS boolean AS $$
DECLARE
  rid text;
  ok boolean;
BEGIN
  IF p_workspace IS NULL OR p_business IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opsiq_privacy_eraser') THEN RETURN false; END IF;
  IF NOT pg_has_role(session_user, 'opsiq_privacy_eraser', 'MEMBER') THEN RETURN false; END IF;
  rid := current_setting('opsiq.erasure_request_id', true);
  IF rid IS NULL OR rid = '' THEN RETURN false; END IF;
  BEGIN
    SELECT true INTO ok FROM privacy_erasure_requests
     WHERE id = rid::uuid AND workspace_id = p_workspace AND business_id = p_business
       AND status = 'EXECUTING' AND approved_by IS NOT NULL AND manifest_hash IS NOT NULL;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN COALESCE(ok, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public;

-- Observations: immutable except the confirmation counters; DELETE only for an authorized erasure of this very business.
CREATE OR REPLACE FUNCTION qbo_report_snapshots_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF qbo_erasure_authorized(OLD.workspace_id, OLD.business_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'qbo_report_snapshots rows are immutable evidence and cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.workspace_id, NEW.business_id, NEW.connection_id, NEW.environment, NEW.realm_id, NEW.report_type,
      NEW.period_start, NEW.period_end, NEW.accounting_basis, NEW.basis_source, NEW.currency, NEW.version, NEW.content_hash,
      NEW.parser_version, NEW.no_report_data, NEW."values", NEW.provider_tid, NEW.acquired_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.workspace_id, OLD.business_id, OLD.connection_id, OLD.environment, OLD.realm_id, OLD.report_type,
      OLD.period_start, OLD.period_end, OLD.accounting_basis, OLD.basis_source, OLD.currency, OLD.version, OLD.content_hash,
      OLD.parser_version, OLD.no_report_data, OLD."values", OLD.provider_tid, OLD.acquired_at, OLD.created_at) THEN
    RAISE EXCEPTION 'qbo_report_snapshots observed values are immutable; record a new version instead' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Provenance: append-only; DELETE only for an authorized erasure of this very business. UPDATE is never allowed.
CREATE OR REPLACE FUNCTION qbo_canonical_provenance_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND qbo_erasure_authorized(OLD.workspace_id, OLD.business_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'qbo_canonical_provenance is append-only evidence' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

-- Decision records / outcome assessments: append-only; DELETE or UPDATE only for an authorized erasure of this very business
-- (UPDATE exists so an assessment that merely POINTS at an erased diagnosis can have the pointer detached instead of being deleted).
CREATE OR REPLACE FUNCTION owner_outcome_persistence_append_only() RETURNS TRIGGER AS $$
BEGIN
  IF qbo_erasure_authorized(OLD."workspace_id", OLD."business_id") THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not permitted (write a new decision/assessment version instead)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
