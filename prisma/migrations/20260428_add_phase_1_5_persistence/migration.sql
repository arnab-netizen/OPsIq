-- AlterTable
ALTER TABLE "users" ADD COLUMN "operatorItemsCreated" TEXT,
ADD COLUMN "operatorItemsCompleted" TEXT,
ADD COLUMN "operatorItemsVerified" TEXT,
ADD COLUMN "overrideRecords" TEXT,
ADD COLUMN "entitiesCreated" TEXT,
ADD COLUMN "financialBaselinesCreated" TEXT;

-- CreateTable
CREATE TABLE "calibration_records" (
    "id" UUID NOT NULL,
    "operator_item_id" UUID NOT NULL,
    "predicted_impact" DECIMAL(15,2) NOT NULL,
    "actual_impact" DECIMAL(15,2) NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "deviation" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "override_records" (
    "id" UUID NOT NULL,
    "operator_item_id" UUID NOT NULL,
    "original_action" TEXT NOT NULL,
    "overridden_action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "overridden_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "override_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "external_id" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_links" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "operator_item_id" UUID NOT NULL,
    "linkType" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "operator_item_id" UUID,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response_code" INTEGER,
    "response_body" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_baselines" (
    "id" UUID NOT NULL,
    "engagement_id" UUID,
    "revenue" DECIMAL(15,2) NOT NULL,
    "costs" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),

    CONSTRAINT "financial_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calibration_records_operator_item_id_created_at_key" ON "calibration_records"("operator_item_id", "created_at");

-- CreateIndex
CREATE INDEX "calibration_records_operator_item_id_idx" ON "calibration_records"("operator_item_id");

-- CreateIndex
CREATE INDEX "calibration_records_created_at_idx" ON "calibration_records"("created_at");

-- CreateIndex
CREATE INDEX "operator_items_status_idx" ON "operator_items"("status");

-- CreateIndex
CREATE INDEX "operator_items_created_by_idx" ON "operator_items"("created_by");

-- CreateIndex
CREATE INDEX "operator_items_created_at_idx" ON "operator_items"("created_at");

-- CreateIndex
CREATE INDEX "override_records_operator_item_id_idx" ON "override_records"("operator_item_id");

-- CreateIndex
CREATE INDEX "override_records_overridden_by_idx" ON "override_records"("overridden_by");

-- CreateIndex
CREATE INDEX "entities_type_idx" ON "entities"("type");

-- CreateIndex
CREATE INDEX "entities_external_id_idx" ON "entities"("external_id");

-- CreateIndex
CREATE INDEX "entities_created_by_idx" ON "entities"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "entity_links_entity_id_operator_item_id_key" ON "entity_links"("entity_id", "operator_item_id");

-- CreateIndex
CREATE INDEX "entity_links_operator_item_id_idx" ON "entity_links"("operator_item_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_retry_at_idx" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_event_name_created_at_idx" ON "webhook_deliveries"("event_name", "created_at");

-- CreateIndex
CREATE INDEX "financial_baselines_engagement_id_idx" ON "financial_baselines"("engagement_id");

-- CreateIndex
CREATE INDEX "financial_baselines_source_idx" ON "financial_baselines"("source");

-- AddForeignKey
ALTER TABLE "operator_items" ADD CONSTRAINT "operator_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_items" ADD CONSTRAINT "operator_items_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_items" ADD CONSTRAINT "operator_items_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_operator_item_id_fkey" FOREIGN KEY ("operator_item_id") REFERENCES "operator_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_records" ADD CONSTRAINT "override_records_operator_item_id_fkey" FOREIGN KEY ("operator_item_id") REFERENCES "operator_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_records" ADD CONSTRAINT "override_records_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_operator_item_id_fkey" FOREIGN KEY ("operator_item_id") REFERENCES "operator_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_operator_item_id_fkey" FOREIGN KEY ("operator_item_id") REFERENCES "operator_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_baselines" ADD CONSTRAINT "financial_baselines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
