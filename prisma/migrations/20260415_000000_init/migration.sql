-- CreateTable "users"
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "hashed_password" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable "sessions"
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable "user_role_assignments"
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "scope" TEXT,
    "scope_id" UUID,
    "granted_by" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable "engagement_memberships"
CREATE TABLE "engagement_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "added_by" UUID,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "engagement_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable "lead_records"
CREATE TABLE "lead_records" (
    "id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "estimated_value" DOUBLE PRECISION,
    "converted_to_client_id" UUID,
    "engagement_id" UUID,
    "assigned_to" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable "client_accounts"
CREATE TABLE "client_accounts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "website" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "client_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable "client_contacts"
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable "engagements"
CREATE TABLE "engagements" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "service_tier" TEXT NOT NULL,
    "engagement_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "health_status" TEXT NOT NULL DEFAULT 'healthy',
    "intervention_mode" TEXT NOT NULL DEFAULT 'recovery',
    "intervention_phase" TEXT NOT NULL DEFAULT 'triage',
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "target_end_date" TIMESTAMP(3),
    "actual_end_date" TIMESTAMP(3),
    "owner_id" UUID,
    "assigned_consultant_id" UUID,
    "current_scope_version_id" UUID,
    "parent_engagement_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable "business_condition_profiles"
CREATE TABLE "business_condition_profiles" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "business_status" TEXT NOT NULL,
    "severity_score" INTEGER NOT NULL,
    "urgency_level" TEXT NOT NULL,
    "cash_pressure_level" TEXT NOT NULL,
    "margin_pressure_level" TEXT NOT NULL,
    "client_concentration_risk" TEXT NOT NULL,
    "owner_dependency_risk" TEXT NOT NULL,
    "key_person_dependency_risk" TEXT NOT NULL,
    "process_maturity_level" TEXT NOT NULL,
    "management_maturity_level" TEXT NOT NULL,
    "execution_capacity_level" TEXT NOT NULL,
    "morale_fragility_level" TEXT NOT NULL,
    "resilience_level" TEXT NOT NULL,
    "growth_readiness_level" TEXT NOT NULL,
    "notes" TEXT,
    "assessed_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_condition_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable "audit_events"
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_type" TEXT NOT NULL DEFAULT 'user',
    "entity_type" TEXT,
    "entity_id" UUID,
    "payload" JSONB,
    "correlation_id" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable "idempotency_records"
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "operation_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable "scheduled_tasks"
CREATE TABLE "scheduled_tasks" (
    "id" UUID NOT NULL,
    "task_name" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_user_id_role_scope_scope_id_key" ON "user_role_assignments"("user_id", "role", "scope", "scope_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_user_id_is_active_idx" ON "user_role_assignments"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_memberships_user_id_engagement_id_role_key" ON "engagement_memberships"("user_id", "engagement_id", "role");

-- CreateIndex
CREATE INDEX "engagement_memberships_engagement_id_is_active_idx" ON "engagement_memberships"("engagement_id", "is_active");

-- CreateIndex
CREATE INDEX "engagement_memberships_user_id_is_active_idx" ON "engagement_memberships"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "lead_records_status_idx" ON "lead_records"("status");

-- CreateIndex
CREATE INDEX "lead_records_assigned_to_idx" ON "lead_records"("assigned_to");

-- CreateIndex
CREATE INDEX "lead_records_converted_to_client_id_idx" ON "lead_records"("converted_to_client_id");

-- CreateIndex
CREATE INDEX "client_accounts_status_idx" ON "client_accounts"("status");

-- CreateIndex
CREATE INDEX "client_contacts_client_id_is_active_idx" ON "client_contacts"("client_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "engagements_code_key" ON "engagements"("code");

-- CreateIndex
CREATE INDEX "engagements_client_id_idx" ON "engagements"("client_id");

-- CreateIndex
CREATE INDEX "engagements_status_idx" ON "engagements"("status");

-- CreateIndex
CREATE INDEX "engagements_owner_id_idx" ON "engagements"("owner_id");

-- CreateIndex
CREATE INDEX "engagements_parent_engagement_id_idx" ON "engagements"("parent_engagement_id");

-- CreateIndex
CREATE INDEX "business_condition_profiles_engagement_id_is_current_idx" ON "business_condition_profiles"("engagement_id", "is_current");

-- CreateIndex
CREATE INDEX "business_condition_profiles_engagement_id_idx" ON "business_condition_profiles"("engagement_id");

-- CreateIndex
CREATE INDEX "audit_events_event_name_idx" ON "audit_events"("event_name");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events"("actor_id");

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_idempotency_key_key" ON "idempotency_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "idempotency_records_idempotency_key_idx" ON "idempotency_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE INDEX "scheduled_tasks_status_scheduled_for_idx" ON "scheduled_tasks"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "scheduled_tasks_task_name_idx" ON "scheduled_tasks"("task_name");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_memberships" ADD CONSTRAINT "engagement_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_memberships" ADD CONSTRAINT "engagement_memberships_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_records" ADD CONSTRAINT "lead_records_client_id_fkey" FOREIGN KEY ("converted_to_client_id") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_records" ADD CONSTRAINT "lead_records_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_parent_engagement_id_fkey" FOREIGN KEY ("parent_engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_condition_profiles" ADD CONSTRAINT "business_condition_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
