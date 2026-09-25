-- QuickBooks Online integration (additive only; no existing column/constraint changed).

-- AlterTable
ALTER TABLE "owner_connectors" ADD COLUMN     "environment" TEXT,
ADD COLUMN     "external_account_id" TEXT,
ADD COLUMN     "external_account_name" TEXT,
ADD COLUMN     "oauth_state_actor_id" UUID,
ADD COLUMN     "oauth_state_expires_at" TIMESTAMP(3),
ADD COLUMN     "oauth_state_hash" TEXT,
ADD COLUMN     "sync_lease_expires_at" TIMESTAMP(3),
ADD COLUMN     "sync_state" JSONB;

-- AlterTable
ALTER TABLE "owner_connector_tokens" ADD COLUMN     "refresh_locked_until" TIMESTAMP(3),
ADD COLUMN     "refresh_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "owner_connector_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "business_id" UUID,
    "connector_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_account" TEXT NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "remote_id" VARCHAR(255) NOT NULL,
    "remote_sync_token" VARCHAR(64),
    "remote_updated_at" TIMESTAMP(3),
    "remote_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "data" JSONB NOT NULL,
    "opsiq_entity_type" VARCHAR(64),
    "opsiq_entity_id" VARCHAR(255),
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_run_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_connector_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_connector_writes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "business_id" UUID,
    "connector_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "provider_request_id" VARCHAR(50) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "remote_id" VARCHAR(255),
    "remote_sync_token" VARCHAR(64),
    "error_code" VARCHAR(64),
    "error_message" VARCHAR(500),
    "opsiq_entity_type" VARCHAR(64),
    "opsiq_entity_id" VARCHAR(255),
    "requested_by" UUID NOT NULL,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "owner_connector_writes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_connector_records_workspace_id_entity_type_idx" ON "owner_connector_records"("workspace_id", "entity_type");

-- CreateIndex
CREATE INDEX "owner_connector_records_workspace_id_opsiq_entity_type_opsi_idx" ON "owner_connector_records"("workspace_id", "opsiq_entity_type", "opsiq_entity_id");

-- CreateIndex
CREATE INDEX "owner_connector_records_connector_id_remote_updated_at_idx" ON "owner_connector_records"("connector_id", "remote_updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_connector_records_connector_id_entity_type_remote_id_key" ON "owner_connector_records"("connector_id", "entity_type", "remote_id");

-- CreateIndex
CREATE INDEX "owner_connector_writes_connector_id_status_idx" ON "owner_connector_writes"("connector_id", "status");

-- CreateIndex
CREATE INDEX "owner_connector_writes_workspace_id_opsiq_entity_type_opsiq_idx" ON "owner_connector_writes"("workspace_id", "opsiq_entity_type", "opsiq_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_connector_writes_workspace_id_idempotency_key_key" ON "owner_connector_writes"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "owner_connectors_provider_external_account_id_idx" ON "owner_connectors"("provider", "external_account_id");

-- AddForeignKey
ALTER TABLE "owner_connector_records" ADD CONSTRAINT "owner_connector_records_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "owner_connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_connector_writes" ADD CONSTRAINT "owner_connector_writes_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "owner_connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

