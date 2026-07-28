-- Stage 5: Add owner_business_condition_profiles, owner_connectors, owner_connector_tokens
-- These tables back the BCP service (Bundle 4.2/5.1) and Integration Connector Registry (Bundle 5.2).
-- No FK constraints to Workspace/User — workspace isolation enforced at service layer.

-- OwnerBusinessConditionProfile: append-only history of business condition snapshots.
-- Exactly one row per (workspace_id, business_id) has is_current=true at any time.
-- Concurrent write safety enforced via Serializable transaction in evaluateConditionProfile.
CREATE TABLE "public"."owner_business_condition_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "condition_code" TEXT NOT NULL,
    "condition_severity" TEXT NOT NULL,
    "consulting_lifecycle_stage" TEXT NOT NULL,
    "business_condition_score" INTEGER NOT NULL,
    "intervention_mode" TEXT NOT NULL,
    "intervention_phase" TEXT NOT NULL,
    "human_execution_risk" TEXT NOT NULL,
    "financial_health_score" INTEGER NOT NULL DEFAULT 50,
    "operational_health_score" INTEGER NOT NULL DEFAULT 50,
    "sales_health_score" INTEGER NOT NULL DEFAULT 50,
    "sop_health_score" INTEGER NOT NULL DEFAULT 50,
    "recommendation_priority" TEXT NOT NULL,
    "review_cadence" TEXT NOT NULL,
    "health_status" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "trigger_description" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "input_facts_json" TEXT NOT NULL,
    "source_reassessment_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_business_condition_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "owner_business_condition_profiles_workspace_id_idx" ON "public"."owner_business_condition_profiles"("workspace_id");
CREATE INDEX "owner_business_condition_profiles_business_id_idx" ON "public"."owner_business_condition_profiles"("business_id");
CREATE INDEX "owner_business_condition_profiles_workspace_id_business_id_is_current_idx" ON "public"."owner_business_condition_profiles"("workspace_id", "business_id", "is_current");
CREATE INDEX "owner_business_condition_profiles_business_id_version_idx" ON "public"."owner_business_condition_profiles"("business_id", "version");

-- OwnerConnector: integration connector registry.
-- Unique per (workspace_id, provider) — one active connector per provider per workspace.
CREATE TABLE "public"."owner_connectors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "business_id" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_records" INTEGER,
    "token_expires_at" TIMESTAMP(3),
    "sync_failure_message" TEXT,
    "registered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_connectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "owner_connectors_workspace_id_provider_key" ON "public"."owner_connectors"("workspace_id", "provider");
CREATE INDEX "owner_connectors_workspace_id_idx" ON "public"."owner_connectors"("workspace_id");
CREATE INDEX "owner_connectors_workspace_id_status_idx" ON "public"."owner_connectors"("workspace_id", "status");
CREATE INDEX "owner_connectors_business_id_idx" ON "public"."owner_connectors"("business_id");

-- OwnerConnectorToken: encrypted token storage, separate from connector registry.
-- Tokens are never exposed in connector queries — fetched only by token refresh service.
CREATE TABLE "public"."owner_connector_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connector_id" UUID NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "token_type" TEXT NOT NULL DEFAULT 'Bearer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_connector_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "owner_connector_tokens_connector_id_key" ON "public"."owner_connector_tokens"("connector_id");
CREATE INDEX "owner_connector_tokens_connector_id_idx" ON "public"."owner_connector_tokens"("connector_id");

ALTER TABLE "public"."owner_connector_tokens" ADD CONSTRAINT "owner_connector_tokens_connector_id_fkey"
    FOREIGN KEY ("connector_id") REFERENCES "public"."owner_connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
