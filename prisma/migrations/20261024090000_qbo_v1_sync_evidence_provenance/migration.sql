-- QuickBooks Online V1 — sync state, immutable versioned report observations, canonical provenance. ADDITIVE ONLY.
-- Four new empty tables + four additive UNIQUE indexes on existing tables (each includes the primary key / an
-- already-unique column set, so no existing row can violate it; no row is altered, dropped or backfilled).
-- Preflight: nothing to de-duplicate.
--
-- Tenancy and evidence integrity are enforced by the DATABASE:
--   * every row is bound to (connection, workspace, business) — and to (environment, realm) for observations and
--     provenance — by composite FKs, so cross-workspace, cross-business and cross-connection/realm substitution is rejected;
--   * report observations are immutable (only the confirmation counters may change) and cannot be deleted;
--   * provenance is append-only and cannot be updated or deleted;
--   * Sandbox evidence can only be linked to a fixture business and production evidence only to a real one.

-- CreateTable
CREATE TABLE "qbo_sync_state" (
    "connection_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "baseline_cursor" DATE,
    "baseline_completed_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_full_reconcile_at" TIMESTAMP(3),
    "webhook_pending_at" TIMESTAMP(3),
    "last_webhook_at" TIMESTAMP(3),
    "company_name" TEXT,
    "last_run_summary" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_sync_state_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "qbo_report_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "accounting_basis" TEXT NOT NULL,
    "basis_source" TEXT NOT NULL,
    "currency" TEXT,
    "version" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "parser_version" INTEGER NOT NULL,
    "no_report_data" BOOLEAN NOT NULL,
    "values" JSONB NOT NULL,
    "provider_tid" TEXT,
    "acquired_at" TIMESTAMP(3) NOT NULL,
    "last_confirmed_at" TIMESTAMP(3) NOT NULL,
    "confirm_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qbo_report_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qbo_canonical_provenance" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "financial_snapshot_id" UUID,
    "cashflow_snapshot_id" UUID,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "accounting_basis" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "pl_observation_id" UUID,
    "bs_observation_id" UUID,
    "ar_observation_id" UUID,
    "ap_observation_id" UUID,
    "derived_values" JSONB NOT NULL,
    "target_updated_at" TIMESTAMP(3),
    "materialized_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_canonical_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qbo_sync_state_workspace_id_business_id_idx" ON "qbo_sync_state"("workspace_id", "business_id");

-- CreateIndex
CREATE INDEX "qbo_sync_state_lifecycle_idx" ON "qbo_sync_state"("lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_sync_state_tenant_key" ON "qbo_sync_state"("connection_id", "workspace_id", "business_id");

-- CreateIndex
CREATE INDEX "qbo_report_snapshots_workspace_id_business_id_report_type_p_idx" ON "qbo_report_snapshots"("workspace_id", "business_id", "report_type", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_report_snapshots_identity_version_key" ON "qbo_report_snapshots"("connection_id", "report_type", "period_start", "period_end", "accounting_basis", "version");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_report_snapshots_tenant_key" ON "qbo_report_snapshots"("id", "workspace_id", "connection_id");

-- CreateIndex
CREATE INDEX "qbo_canonical_provenance_workspace_id_business_id_period_en_idx" ON "qbo_canonical_provenance"("workspace_id", "business_id", "period_end");

-- CreateIndex
CREATE INDEX "qbo_canonical_provenance_financial_snapshot_id_idx" ON "qbo_canonical_provenance"("financial_snapshot_id");

-- CreateIndex
CREATE INDEX "qbo_canonical_provenance_cashflow_snapshot_id_idx" ON "qbo_canonical_provenance"("cashflow_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_cashflow_snapshots_tenant_key" ON "owner_cashflow_snapshots"("id", "workspace_id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_fin_snapshots_tenant_key" ON "owner_financial_snapshots"("id", "workspace_id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_connections_business_key" ON "qbo_connections"("id", "workspace_id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_connections_realm_key" ON "qbo_connections"("id", "workspace_id", "business_id", "environment", "realm_id");

-- AddForeignKey
ALTER TABLE "qbo_sync_state" ADD CONSTRAINT "qbo_sync_state_connection_id_workspace_id_business_id_fkey" FOREIGN KEY ("connection_id", "workspace_id", "business_id") REFERENCES "qbo_connections"("id", "workspace_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_connection_id_workspace_id_business_i_fkey" FOREIGN KEY ("connection_id", "workspace_id", "business_id", "environment", "realm_id") REFERENCES "qbo_connections"("id", "workspace_id", "business_id", "environment", "realm_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_connection_id_workspace_id_busine_fkey" FOREIGN KEY ("connection_id", "workspace_id", "business_id", "environment", "realm_id") REFERENCES "qbo_connections"("id", "workspace_id", "business_id", "environment", "realm_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_financial_snapshot_id_workspace_i_fkey" FOREIGN KEY ("financial_snapshot_id", "workspace_id", "business_id") REFERENCES "owner_financial_snapshots"("id", "workspace_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_cashflow_snapshot_id_workspace_id_fkey" FOREIGN KEY ("cashflow_snapshot_id", "workspace_id", "business_id") REFERENCES "owner_cashflow_snapshots"("id", "workspace_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_pl_observation_id_workspace_id_co_fkey" FOREIGN KEY ("pl_observation_id", "workspace_id", "connection_id") REFERENCES "qbo_report_snapshots"("id", "workspace_id", "connection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_bs_observation_id_workspace_id_co_fkey" FOREIGN KEY ("bs_observation_id", "workspace_id", "connection_id") REFERENCES "qbo_report_snapshots"("id", "workspace_id", "connection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_ar_observation_id_workspace_id_co_fkey" FOREIGN KEY ("ar_observation_id", "workspace_id", "connection_id") REFERENCES "qbo_report_snapshots"("id", "workspace_id", "connection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_ap_observation_id_workspace_id_co_fkey" FOREIGN KEY ("ap_observation_id", "workspace_id", "connection_id") REFERENCES "qbo_report_snapshots"("id", "workspace_id", "connection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provider-resource locks (sync, refresh). A compare-and-set row with a DB-clock expiry, NOT a Postgres advisory lock: the
-- application pool has ONE connection (src/lib/db.ts) and runs behind a pooler, so a lock held by an open transaction/session
-- would deadlock or silently drop. A crashed holder simply expires. This is not a scheduler lease (that lives on scheduled_tasks).
CREATE TABLE "qbo_resource_locks" (
    "connection_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "holder_token" UUID NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_resource_locks_pkey" PRIMARY KEY ("connection_id","scope")
);
CREATE INDEX "qbo_resource_locks_workspace_id_idx" ON "qbo_resource_locks"("workspace_id");
CREATE INDEX "qbo_resource_locks_expires_at_idx" ON "qbo_resource_locks"("expires_at");
ALTER TABLE "qbo_resource_locks" ADD CONSTRAINT "qbo_resource_locks_connection_id_workspace_id_fkey" FOREIGN KEY ("connection_id", "workspace_id") REFERENCES "qbo_connections"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qbo_resource_locks" ADD CONSTRAINT "qbo_resource_locks_scope_check" CHECK ("scope" IN ('sync', 'refresh'));
ALTER TABLE "qbo_resource_locks" ADD CONSTRAINT "qbo_resource_locks_lifetime_check" CHECK ("expires_at" > "acquired_at");

-- CHECK constraints
ALTER TABLE "qbo_sync_state" ADD CONSTRAINT "qbo_sync_state_lifecycle_check" CHECK ("lifecycle" IN ('NEVER_SYNCED', 'BASELINING', 'SYNCED', 'FAILING'));
ALTER TABLE "qbo_sync_state" ADD CONSTRAINT "qbo_sync_state_failures_check" CHECK ("consecutive_failures" >= 0);
ALTER TABLE "qbo_sync_state" ADD CONSTRAINT "qbo_sync_state_company_name_check" CHECK ("company_name" IS NULL OR char_length("company_name") <= 200);
ALTER TABLE "qbo_sync_state" ADD CONSTRAINT "qbo_sync_state_error_code_check" CHECK ("last_error_code" IS NULL OR "last_error_code" ~ '^[A-Z0-9_]{1,64}$');

ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_environment_check" CHECK ("environment" IN ('sandbox', 'production'));
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_report_type_check" CHECK ("report_type" IN ('PROFIT_AND_LOSS', 'BALANCE_SHEET', 'AGED_RECEIVABLES', 'AGED_PAYABLES'));
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_basis_check" CHECK ("accounting_basis" IN ('ACCRUAL', 'CASH'));
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_basis_source_check" CHECK ("basis_source" IN ('REPORT_HEADER', 'REQUESTED'));
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$');
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_version_check" CHECK ("version" >= 1 AND "parser_version" >= 1 AND "confirm_count" >= 0);
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_period_check" CHECK ("period_end" >= "period_start");
ALTER TABLE "qbo_report_snapshots" ADD CONSTRAINT "qbo_report_snapshots_values_object_check" CHECK (jsonb_typeof("values") = 'object' AND pg_column_size("values") <= 8192);

ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_environment_check" CHECK ("environment" IN ('sandbox', 'production'));
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_target_check" CHECK (
  ("target_type" = 'FINANCIAL_SNAPSHOT' AND "financial_snapshot_id" IS NOT NULL AND "cashflow_snapshot_id" IS NULL)
  OR ("target_type" = 'CASHFLOW_SNAPSHOT' AND "cashflow_snapshot_id" IS NOT NULL AND "financial_snapshot_id" IS NULL)
);
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_action_check" CHECK ("action" IN ('CREATED', 'AMENDED', 'UPDATED'));
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_basis_check" CHECK ("accounting_basis" IN ('ACCRUAL', 'CASH'));
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_has_source_check" CHECK ("pl_observation_id" IS NOT NULL OR "bs_observation_id" IS NOT NULL OR "ar_observation_id" IS NOT NULL OR "ap_observation_id" IS NOT NULL);
ALTER TABLE "qbo_canonical_provenance" ADD CONSTRAINT "qbo_canonical_provenance_cashflow_stamp_check" CHECK (("target_type" = 'CASHFLOW_SNAPSHOT') = ("target_updated_at" IS NOT NULL));

-- Observations: immutable except the confirmation counters; never deleted.
CREATE FUNCTION qbo_report_snapshots_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
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
CREATE TRIGGER qbo_report_snapshots_guard_trg BEFORE UPDATE OR DELETE ON "qbo_report_snapshots"
  FOR EACH ROW EXECUTE FUNCTION qbo_report_snapshots_guard();

-- Provenance: append-only.
CREATE FUNCTION qbo_canonical_provenance_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'qbo_canonical_provenance is append-only evidence' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER qbo_canonical_provenance_guard_trg BEFORE UPDATE OR DELETE ON "qbo_canonical_provenance"
  FOR EACH ROW EXECUTE FUNCTION qbo_canonical_provenance_guard();

-- Sandbox isolation: Sandbox evidence may only reach a fixture business; production evidence only a real one.
CREATE FUNCTION qbo_canonical_provenance_environment_guard() RETURNS trigger AS $$
DECLARE
  fixture boolean;
BEGIN
  SELECT "is_fixture_business" INTO fixture FROM "owner_businesses" WHERE "id" = NEW."business_id" AND "workspace_id" = NEW."workspace_id";
  IF fixture IS NULL THEN
    RAISE EXCEPTION 'QBO provenance business not found in workspace' USING ERRCODE = '23503';
  END IF;
  IF (NEW."environment" = 'sandbox') <> fixture THEN
    RAISE EXCEPTION 'QBO_ENVIRONMENT_ISOLATION: sandbox evidence may only be materialized into a fixture business, production evidence only into a real one' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER qbo_canonical_provenance_environment_guard_trg BEFORE INSERT ON "qbo_canonical_provenance"
  FOR EACH ROW EXECUTE FUNCTION qbo_canonical_provenance_environment_guard();
