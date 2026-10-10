-- QuickBooks Online READ-ONLY synchronization persistence — ADDITIVE ONLY.
-- Five new, empty tables plus ONE new unique index on qbo_connections (id, workspace_id, business_id). No existing
-- column, row, constraint or index is altered, dropped or backfilled. The new index is built on a table whose
-- (id) is already unique, so it cannot fail for data reasons.
--
-- Tenancy is enforced by the DATABASE: every sync table references qbo_connections by the composite
-- (connection_id, workspace_id, business_id), so a row cannot name a connection that belongs to another workspace or
-- business. qbo_webhook_events is the only table with nullable tenant columns (an unknown realm is stored unresolved,
-- never guessed) and it holds no payload.
--
-- Nothing here stores a token: ciphertext stays exclusively in qbo_connection_tokens.

-- Composite FK target
CREATE UNIQUE INDEX "qbo_connections_tenant_business_key" ON "qbo_connections"("id", "workspace_id", "business_id");

-- CreateTable
CREATE TABLE "qbo_sync_states" (
    "connection_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "lease_token" UUID,
    "lease_run_id" UUID,
    "lease_expires_at" TIMESTAMP(3),
    "lease_epoch" INTEGER NOT NULL DEFAULT 0,
    "last_attempted_at" TIMESTAMP(3),
    "last_succeeded_at" TIMESTAMP(3),
    "last_full_sync_at" TIMESTAMP(3),
    "last_outcome" TEXT,
    "last_error_code" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_not_before" TIMESTAMP(3),
    "watermarks" JSONB NOT NULL DEFAULT '{}',
    "last_change_at" TIMESTAMP(3),
    "webhook_hint_at" TIMESTAMP(3),
    "refresh_claim_token" UUID,
    "refresh_claim_expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_sync_states_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "qbo_sync_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_by_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "lease_epoch" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "error_code" TEXT,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "changed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qbo_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qbo_synced_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "provider_entity_id" TEXT NOT NULL,
    "provider_sync_token" TEXT,
    "provider_updated_at" TIMESTAMP(3),
    "record_state" TEXT NOT NULL,
    "normalized" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "first_seen_run_id" UUID NOT NULL,
    "last_seen_run_id" UUID NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_synced_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qbo_report_observations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "report_name" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "basis" TEXT NOT NULL,
    "currency" TEXT,
    "metrics" JSONB NOT NULL,
    "inconsistencies" JSONB NOT NULL DEFAULT '[]',
    "content_hash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "previous_metrics" JSONB,
    "previous_content_hash" TEXT,
    "provider_generated_at" TIMESTAMP(3),
    "first_seen_run_id" UUID NOT NULL,
    "last_seen_run_id" UUID NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_report_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qbo_webhook_events" (
    "id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider_event_time" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL,
    "disposition" TEXT NOT NULL,
    "workspace_id" UUID,
    "business_id" UUID,
    "connection_id" UUID,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "qbo_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qbo_sync_states_tenant_key" ON "qbo_sync_states"("connection_id", "workspace_id", "business_id");
CREATE INDEX "qbo_sync_states_workspace_id_business_id_idx" ON "qbo_sync_states"("workspace_id", "business_id");
CREATE INDEX "qbo_sync_states_lease_expires_at_idx" ON "qbo_sync_states"("lease_expires_at");
CREATE UNIQUE INDEX "qbo_sync_runs_idempotency_key" ON "qbo_sync_runs"("connection_id", "idempotency_key");
CREATE INDEX "qbo_sync_runs_workspace_id_business_id_started_at_idx" ON "qbo_sync_runs"("workspace_id", "business_id", "started_at");
CREATE INDEX "qbo_sync_runs_connection_id_status_idx" ON "qbo_sync_runs"("connection_id", "status");
CREATE UNIQUE INDEX "qbo_synced_records_provider_key" ON "qbo_synced_records"("connection_id", "entity_type", "provider_entity_id");
CREATE INDEX "qbo_synced_records_workspace_id_business_id_entity_type_idx" ON "qbo_synced_records"("workspace_id", "business_id", "entity_type");
CREATE UNIQUE INDEX "qbo_report_observations_period_key" ON "qbo_report_observations"("connection_id", "report_name", "period_start", "period_end", "basis");
CREATE INDEX "qbo_report_obs_tenant_report_idx" ON "qbo_report_observations"("workspace_id", "business_id", "report_name");
CREATE UNIQUE INDEX "qbo_webhook_events_event_key_key" ON "qbo_webhook_events"("event_key");
CREATE INDEX "qbo_webhook_events_realm_id_received_at_idx" ON "qbo_webhook_events"("realm_id", "received_at");
CREATE INDEX "qbo_webhook_events_connection_id_idx" ON "qbo_webhook_events"("connection_id");

-- AddForeignKey (tenant + business bound composite)
ALTER TABLE "qbo_sync_states" ADD CONSTRAINT "qbo_sync_states_connection_id_workspace_id_business_id_fkey" FOREIGN KEY ("connection_id", "workspace_id", "business_id") REFERENCES "qbo_connections"("id", "workspace_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qbo_sync_runs" ADD CONSTRAINT "qbo_sync_runs_connection_id_workspace_id_business_id_fkey" FOREIGN KEY ("connection_id", "workspace_id", "business_id") REFERENCES "qbo_connections"("id", "workspace_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qbo_synced_records" ADD CONSTRAINT "qbo_synced_records_connection_id_workspace_id_business_id_fkey" FOREIGN KEY ("connection_id", "workspace_id", "business_id") REFERENCES "qbo_connections"("id", "workspace_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qbo_report_observations" ADD CONSTRAINT "qbo_report_obs_connection_tenant_fkey" FOREIGN KEY ("connection_id", "workspace_id", "business_id") REFERENCES "qbo_connections"("id", "workspace_id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints
ALTER TABLE "qbo_sync_states" ADD CONSTRAINT "qbo_sync_states_lease_shape_check" CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL) AND ("lease_token" IS NULL) = ("lease_run_id" IS NULL));
ALTER TABLE "qbo_sync_states" ADD CONSTRAINT "qbo_sync_states_refresh_claim_shape_check" CHECK (("refresh_claim_token" IS NULL) = ("refresh_claim_expires_at" IS NULL));
ALTER TABLE "qbo_sync_states" ADD CONSTRAINT "qbo_sync_states_counters_check" CHECK ("lease_epoch" >= 0 AND "consecutive_failures" >= 0 AND "version" >= 1);
ALTER TABLE "qbo_sync_states" ADD CONSTRAINT "qbo_sync_states_outcome_check" CHECK ("last_outcome" IS NULL OR "last_outcome" IN ('SUCCEEDED', 'FAILED'));
ALTER TABLE "qbo_sync_runs" ADD CONSTRAINT "qbo_sync_runs_trigger_check" CHECK ("trigger" IN ('MANUAL', 'SCHEDULED', 'WEBHOOK'));
ALTER TABLE "qbo_sync_runs" ADD CONSTRAINT "qbo_sync_runs_mode_check" CHECK ("mode" IN ('FULL', 'INCREMENTAL'));
ALTER TABLE "qbo_sync_runs" ADD CONSTRAINT "qbo_sync_runs_status_check" CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABANDONED'));
ALTER TABLE "qbo_sync_runs" ADD CONSTRAINT "qbo_sync_runs_finish_shape_check" CHECK (("status" = 'RUNNING') = ("finished_at" IS NULL));
ALTER TABLE "qbo_synced_records" ADD CONSTRAINT "qbo_synced_records_entity_check" CHECK ("entity_type" IN ('CompanyInfo', 'Customer', 'Invoice', 'Bill'));
ALTER TABLE "qbo_synced_records" ADD CONSTRAINT "qbo_synced_records_state_check" CHECK ("record_state" IN ('ACTIVE', 'INACTIVE', 'MISSING'));
ALTER TABLE "qbo_synced_records" ADD CONSTRAINT "qbo_synced_records_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$' AND "revision" >= 1);
ALTER TABLE "qbo_report_observations" ADD CONSTRAINT "qbo_report_observations_report_check" CHECK ("report_name" IN ('ProfitAndLoss', 'BalanceSheet', 'AgedReceivables', 'AgedPayables'));
ALTER TABLE "qbo_report_observations" ADD CONSTRAINT "qbo_report_observations_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$' AND "revision" >= 1 AND "period_end" >= "period_start");
ALTER TABLE "qbo_webhook_events" ADD CONSTRAINT "qbo_webhook_events_key_check" CHECK ("event_key" ~ '^[0-9a-f]{64}$' AND "realm_id" ~ '^[0-9]{1,64}$');
ALTER TABLE "qbo_webhook_events" ADD CONSTRAINT "qbo_webhook_events_disposition_check" CHECK ("disposition" IN ('RECEIVED', 'HINT_RECORDED', 'IGNORED_UNKNOWN_REALM', 'IGNORED_NOT_ACTIVE'));
ALTER TABLE "qbo_webhook_events" ADD CONSTRAINT "qbo_webhook_events_resolution_check" CHECK (("workspace_id" IS NULL) = ("connection_id" IS NULL) AND ("workspace_id" IS NULL) = ("business_id" IS NULL));
