-- QuickBooks Online business-scoped connection persistence — ADDITIVE ONLY.
-- Three new, empty tables. No existing table, column, row, index or constraint is altered, dropped or backfilled
-- (the composite FK target owner_businesses(id, workspace_id) already has its unique index from 20261006150000).
-- Preflight: nothing to de-duplicate — every unique/partial-unique index is built on a new empty table.
--
-- Tenancy is enforced by the DATABASE, not only by services:
--   * (business_id, workspace_id) must be a real owner_businesses pair on every table (a foreign-workspace business is rejected);
--   * a token row can only reference a connection of the SAME workspace;
--   * one realm (environment + realm_id) can be bound to at most ONE non-disconnected connection platform-wide;
--   * one business has at most ONE non-disconnected connection per environment;
--   * the OAuth state is stored as a SHA-256 hash only (format CHECK) and is globally unique;
--   * token columns must hold the versioned AES-256-GCM envelope ("v1gcm.…"), never a bare value.

-- CreateTable
CREATE TABLE "qbo_oauth_states" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "initiated_by_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "qbo_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qbo_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "realm_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "connected_by_id" UUID NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL,
    "reauth_required_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "disconnected_at" TIMESTAMP(3),
    "disconnected_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qbo_connection_tokens" (
    "connection_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "access_token_ciphertext" TEXT NOT NULL,
    "refresh_token_ciphertext" TEXT NOT NULL,
    "token_type" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_token_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_token_hard_expires_at" TIMESTAMP(3),
    "granted_scope" TEXT NOT NULL,
    "intuit_tid" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_connection_tokens_pkey" PRIMARY KEY ("connection_id")
);

-- CreateIndex
CREATE INDEX "qbo_oauth_states_workspace_id_business_id_idx" ON "qbo_oauth_states"("workspace_id", "business_id");

-- CreateIndex
CREATE INDEX "qbo_oauth_states_expires_at_idx" ON "qbo_oauth_states"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_oauth_states_state_hash_key" ON "qbo_oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "qbo_connections_workspace_id_business_id_idx" ON "qbo_connections"("workspace_id", "business_id");

-- CreateIndex
CREATE INDEX "qbo_connections_environment_realm_id_idx" ON "qbo_connections"("environment", "realm_id");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_connections_binding_key" ON "qbo_connections"("workspace_id", "business_id", "environment", "realm_id");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_connections_tenant_key" ON "qbo_connections"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "qbo_connection_tokens_workspace_id_idx" ON "qbo_connection_tokens"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_connection_tokens_tenant_key" ON "qbo_connection_tokens"("connection_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "qbo_oauth_states" ADD CONSTRAINT "qbo_oauth_states_business_id_workspace_id_fkey" FOREIGN KEY ("business_id", "workspace_id") REFERENCES "owner_businesses"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_business_id_workspace_id_fkey" FOREIGN KEY ("business_id", "workspace_id") REFERENCES "owner_businesses"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qbo_connection_tokens" ADD CONSTRAINT "qbo_connection_tokens_connection_id_workspace_id_fkey" FOREIGN KEY ("connection_id", "workspace_id") REFERENCES "qbo_connections"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK constraints
ALTER TABLE "qbo_oauth_states" ADD CONSTRAINT "qbo_oauth_states_environment_check" CHECK ("environment" IN ('sandbox', 'production'));
ALTER TABLE "qbo_oauth_states" ADD CONSTRAINT "qbo_oauth_states_state_hash_check" CHECK ("state_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "qbo_oauth_states" ADD CONSTRAINT "qbo_oauth_states_lifetime_check" CHECK ("expires_at" > "created_at");
ALTER TABLE "qbo_oauth_states" ADD CONSTRAINT "qbo_oauth_states_finalize_requires_consume_check" CHECK ("finalized_at" IS NULL OR "consumed_at" IS NOT NULL);

ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_environment_check" CHECK ("environment" IN ('sandbox', 'production'));
ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_status_check" CHECK ("status" IN ('ACTIVE', 'REAUTH_REQUIRED', 'DISCONNECTED', 'ERROR'));
ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_realm_id_check" CHECK ("realm_id" ~ '^[0-9]{1,64}$');
ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_disconnect_shape_check" CHECK (("status" = 'DISCONNECTED') = ("disconnected_at" IS NOT NULL));

ALTER TABLE "qbo_connection_tokens" ADD CONSTRAINT "qbo_connection_tokens_ciphertext_check" CHECK ("access_token_ciphertext" LIKE 'v1gcm.%' AND "refresh_token_ciphertext" LIKE 'v1gcm.%');
ALTER TABLE "qbo_connection_tokens" ADD CONSTRAINT "qbo_connection_tokens_revision_check" CHECK ("revision" >= 1);

-- Realm binding: an (environment, realm) pair is attached to at most one live connection across ALL tenants.
CREATE UNIQUE INDEX "qbo_connections_live_realm_key" ON "qbo_connections"("environment", "realm_id") WHERE "status" <> 'DISCONNECTED';
-- One live QBO connection per business per environment (a different realm requires an explicit disconnect first).
CREATE UNIQUE INDEX "qbo_connections_live_business_env_key" ON "qbo_connections"("workspace_id", "business_id", "environment") WHERE "status" <> 'DISCONNECTED';
