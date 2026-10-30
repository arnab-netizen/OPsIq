-- QuickBooks Online / Intuit User Data — GOVERNED PRIVACY ERASURE (escape hatch).
--
-- Intuit Developer Terms require deleting User Data at the user's request. The ordinary runtime guarantees stay exactly as they were:
-- qbo_report_snapshots, qbo_canonical_provenance, owner_decision_records and owner_outcome_assessments remain append-only for every
-- session that is not running an APPROVED erasure request. This migration adds ONLY:
--   1. a NOLOGIN role `opsiq_privacy_eraser` (an administrator grants it to the per-operator logins that run the erasure script),
--   2. a tombstone / authorization table `privacy_erasure_requests` (no values, no realm ids, no company names). The database itself
--      records WHICH DATABASE LOGIN requested and approved (session_user, never caller-supplied), enforces the state machine
--      REQUESTED -> DRY_RUN_RECORDED -> APPROVED -> EXECUTING -> EXECUTED and requires the approving login to differ from the
--      requesting login,
--   3. `qbo_erasure_authorized(workspace, business)` — true only when ALL of: the session user is a member of the eraser role, the
--      transaction names a request id (opsiq.erasure_request_id), and that request is EXECUTING *in this very transaction* (the claim
--      stores pg_current_xact_id(), so a committed or forged EXECUTING row authorizes nothing later) for exactly this workspace +
--      business with a second login's approval,
--   4. the existing guard functions, re-created so a DELETE (and, for the two append-only decision tables, a scoped UPDATE that
--      detaches a pointer) is allowed when — and only when — qbo_erasure_authorized() is true for the row's own workspace + business.
-- Every function pins search_path (pg_temp LAST) and schema-qualifies what it reads, so a session cannot shadow the request table with a
-- temporary table. Every other path (UPDATE of provenance / observations, any session without the role, any other business) raises
-- exactly as before. Roles, ownership and grants are NOT in this file: see docs/opsiq/product/QBO_ERASURE_DESIGN.md (role topology) —
-- the ordinary runtime login must be a NON-owner without membership in the eraser role, or none of the above is a boundary.

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
    "requested_db_user" TEXT NOT NULL DEFAULT '',
    "approved_by" TEXT,
    "approved_db_user" TEXT,
    "approved_at" TIMESTAMP(3),
    "manifest_hash" TEXT,
    "dry_run_at" TIMESTAMP(3),
    "executing_xid" TEXT,
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
-- Two-person rule (named operators): the approver is never the requester.
ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_two_person_check" CHECK ("approved_by" IS NULL OR "approved_by" <> "requested_by");
-- Two-login rule (enforced by the database, from session_user): the approving login is never the requesting login.
ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_two_login_check" CHECK ("approved_db_user" IS NULL OR "approved_db_user" <> "requested_db_user");
-- An erasure can only be approved / run against a recorded dry-run manifest by a named approver.
ALTER TABLE "privacy_erasure_requests" ADD CONSTRAINT "privacy_erasure_requests_approval_check" CHECK ("status" NOT IN ('APPROVED', 'EXECUTING', 'EXECUTED') OR ("approved_by" IS NOT NULL AND "approved_db_user" IS NOT NULL AND "approved_at" IS NOT NULL AND "manifest_hash" IS NOT NULL));

REVOKE ALL ON TABLE "privacy_erasure_requests" FROM PUBLIC;

-- The tombstone is permanent and its state machine is enforced here, not in the application: never deleted, identity never rewritten,
-- requester / approver logins stamped from session_user, no skipped or reversed step, an executed request never reopened.
CREATE FUNCTION privacy_erasure_requests_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'privacy_erasure_requests is a permanent tombstone and cannot be deleted' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'REQUESTED' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.manifest_hash IS NOT NULL
       OR NEW.dry_run_at IS NOT NULL OR NEW.executed_at IS NOT NULL OR NEW.result_code IS NOT NULL OR NEW.result_counts IS NOT NULL THEN
      RAISE EXCEPTION 'a privacy erasure request must start as a bare REQUESTED row' USING ERRCODE = '23514';
    END IF;
    NEW.requested_db_user := session_user::text;
    NEW.approved_db_user := NULL;
    NEW.executing_xid := NULL;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.workspace_id, NEW.business_id, NEW.scope, NEW.reason_code, NEW.requested_by, NEW.requested_db_user, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.workspace_id, OLD.business_id, OLD.scope, OLD.reason_code, OLD.requested_by, OLD.requested_db_user, OLD.created_at) THEN
    RAISE EXCEPTION 'privacy_erasure_requests identity columns are immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.status IN ('EXECUTED', 'REJECTED') THEN
    IF (NEW.status, NEW.approved_by, NEW.approved_db_user, NEW.approved_at, NEW.manifest_hash, NEW.executed_at, NEW.result_code, NEW.result_counts)
       IS DISTINCT FROM
       (OLD.status, OLD.approved_by, OLD.approved_db_user, OLD.approved_at, OLD.manifest_hash, OLD.executed_at, OLD.result_code, OLD.result_counts) THEN
      RAISE EXCEPTION 'a finished privacy erasure request is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT ((OLD.status, NEW.status) IN (
       ('REQUESTED', 'REQUESTED'), ('REQUESTED', 'DRY_RUN_RECORDED'), ('REQUESTED', 'REJECTED'),
       ('DRY_RUN_RECORDED', 'DRY_RUN_RECORDED'), ('DRY_RUN_RECORDED', 'APPROVED'), ('DRY_RUN_RECORDED', 'REJECTED'),
       ('APPROVED', 'APPROVED'), ('APPROVED', 'DRY_RUN_RECORDED'), ('APPROVED', 'EXECUTING'), ('APPROVED', 'REJECTED'),
       ('EXECUTING', 'EXECUTING'), ('EXECUTING', 'EXECUTED'))) THEN
    RAISE EXCEPTION 'illegal privacy erasure transition % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('REQUESTED', 'DRY_RUN_RECORDED', 'REJECTED') THEN
    -- Anything that re-opens the dry run clears the approval; the approver can never survive a changed manifest.
    IF NEW.status <> 'REJECTED' AND (NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
      RAISE EXCEPTION 'approval fields can only be set by approving a recorded dry run' USING ERRCODE = '23514';
    END IF;
    NEW.approved_db_user := CASE WHEN NEW.status = 'REJECTED' THEN OLD.approved_db_user ELSE NULL END;
    NEW.executing_xid := NULL;
  ELSIF NEW.status = 'APPROVED' AND OLD.status = 'DRY_RUN_RECORDED' THEN
    IF NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash THEN
      RAISE EXCEPTION 'approval binds to the recorded dry-run manifest' USING ERRCODE = '23514';
    END IF;
    NEW.approved_db_user := session_user::text;
    IF NEW.approved_db_user = OLD.requested_db_user THEN
      RAISE EXCEPTION 'the approving database login must differ from the requesting login' USING ERRCODE = '23514';
    END IF;
    NEW.executing_xid := NULL;
  ELSIF NEW.status IN ('APPROVED', 'EXECUTING', 'EXECUTED') THEN
    IF (NEW.approved_by, NEW.approved_db_user, NEW.approved_at, NEW.manifest_hash)
       IS DISTINCT FROM (OLD.approved_by, OLD.approved_db_user, OLD.approved_at, OLD.manifest_hash) THEN
      RAISE EXCEPTION 'approval and manifest are immutable once approved' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'EXECUTING' AND OLD.status = 'APPROVED' THEN
      NEW.executing_xid := pg_current_xact_id()::text;
    ELSIF NEW.status = 'EXECUTING' THEN
      NEW.executing_xid := OLD.executing_xid;
    ELSE
      NEW.executing_xid := CASE WHEN NEW.status = 'EXECUTED' THEN NULL ELSE OLD.executing_xid END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER privacy_erasure_requests_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON "privacy_erasure_requests"
  FOR EACH ROW EXECUTE FUNCTION privacy_erasure_requests_guard();

-- The single authorization predicate. Fail closed on every branch.
CREATE FUNCTION qbo_erasure_authorized(p_workspace uuid, p_business uuid) RETURNS boolean AS $$
DECLARE
  rid text;
  ok boolean;
BEGIN
  IF p_workspace IS NULL OR p_business IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'opsiq_privacy_eraser') THEN RETURN false; END IF;
  IF NOT pg_catalog.pg_has_role(session_user, 'opsiq_privacy_eraser', 'MEMBER') THEN RETURN false; END IF;
  rid := pg_catalog.current_setting('opsiq.erasure_request_id', true);
  IF rid IS NULL OR rid = '' THEN RETURN false; END IF;
  BEGIN
    SELECT true INTO ok FROM public.privacy_erasure_requests r
     WHERE r.id = rid::uuid AND r.workspace_id = p_workspace AND r.business_id = p_business
       AND r.status = 'EXECUTING' AND r.approved_by IS NOT NULL AND r.manifest_hash IS NOT NULL
       AND r.approved_db_user IS NOT NULL AND r.approved_db_user <> r.requested_db_user
       AND r.executing_xid = pg_catalog.pg_current_xact_id()::text;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN COALESCE(ok, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Observations: immutable except the confirmation counters; DELETE only for an authorized erasure of this very business.
CREATE OR REPLACE FUNCTION qbo_report_snapshots_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.qbo_erasure_authorized(OLD.workspace_id, OLD.business_id) THEN RETURN OLD; END IF;
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
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

-- Provenance: append-only; DELETE only for an authorized erasure of this very business. UPDATE is never allowed.
CREATE OR REPLACE FUNCTION qbo_canonical_provenance_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.qbo_erasure_authorized(OLD.workspace_id, OLD.business_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'qbo_canonical_provenance is append-only evidence' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

-- Decision records / outcome assessments: append-only; DELETE or UPDATE only for an authorized erasure of this very business
-- (UPDATE exists so an assessment that merely POINTS at an erased diagnosis can have the pointer detached instead of being deleted).
CREATE OR REPLACE FUNCTION owner_outcome_persistence_append_only() RETURNS TRIGGER AS $$
BEGIN
  IF public.qbo_erasure_authorized(OLD."workspace_id", OLD."business_id") THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not permitted (write a new decision/assessment version instead)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
