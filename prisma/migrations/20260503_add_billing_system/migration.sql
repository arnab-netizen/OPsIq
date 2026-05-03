-- Add billing system: BillingAccount, Plan, PlanCapability, Subscription, UsageEvent

-- CreateTable "billing_accounts"
CREATE TABLE "billing_accounts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "provider_customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable "plans"
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_monthly" DOUBLE PRECISION NOT NULL,
    "price_yearly" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable "plan_capabilities"
CREATE TABLE "plan_capabilities" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "limit" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable "subscriptions"
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable "usage_events"
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for unique constraints
CREATE UNIQUE INDEX "billing_accounts_workspace_id_key" ON "billing_accounts"("workspace_id");
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");
CREATE UNIQUE INDEX "plan_capabilities_plan_id_key_key" ON "plan_capabilities"("plan_id", "key");
CREATE UNIQUE INDEX "subscriptions_billing_account_id_key" ON "subscriptions"("billing_account_id");

-- CreateIndex for query performance
CREATE INDEX "billing_accounts_status_idx" ON "billing_accounts"("status");
CREATE INDEX "plans_active_idx" ON "plans"("active");
CREATE INDEX "plan_capabilities_plan_id_idx" ON "plan_capabilities"("plan_id");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");
CREATE INDEX "usage_events_workspace_id_idx" ON "usage_events"("workspace_id");
CREATE INDEX "usage_events_workspace_id_key_idx" ON "usage_events"("workspace_id", "key");
CREATE INDEX "usage_events_workspace_id_timestamp_idx" ON "usage_events"("workspace_id", "timestamp");
CREATE INDEX "usage_events_timestamp_idx" ON "usage_events"("timestamp");

-- AddForeignKey for plan_capabilities
ALTER TABLE "plan_capabilities" ADD CONSTRAINT "plan_capabilities_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for subscriptions
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
