-- CreateEnum
CREATE TYPE "evidence_categories" AS ENUM ('FINANCIAL', 'OPERATIONAL', 'HUMAN', 'RESILIENCE', 'CLIENT', 'COMMERCIAL', 'LEADERSHIP', 'EXECUTION');

-- CreateEnum
CREATE TYPE "evidence_validation_statuses" AS ENUM ('DRAFT', 'SUBMITTED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "evidence_traceability_statuses" AS ENUM ('TRACED', 'UNTRACED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "evidence_bundle_statuses" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "bundle_id" UUID,
    "source_owner_id" UUID,
    "category" "evidence_categories" NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_label" TEXT NOT NULL,
    "capture_method" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "validation_status" "evidence_validation_statuses" NOT NULL DEFAULT 'DRAFT',
    "traceability_status" "evidence_traceability_statuses" NOT NULL DEFAULT 'UNTRACED',
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "findings" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_bundles" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "submitted_by" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "submitted_at" TIMESTAMP(3),
    "status" "evidence_bundle_statuses" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_files" (
    "id" UUID NOT NULL,
    "evidence_item_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "checksum" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_files_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "evidence_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_source_owner_id_fkey" FOREIGN KEY ("source_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_evidence_item_id_fkey" FOREIGN KEY ("evidence_item_id") REFERENCES "evidence_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "evidence_items_engagement_id_idx" ON "evidence_items"("engagement_id");

-- CreateIndex
CREATE INDEX "evidence_items_bundle_id_idx" ON "evidence_items"("bundle_id");

-- CreateIndex
CREATE INDEX "evidence_items_validation_status_idx" ON "evidence_items"("validation_status");

-- CreateIndex
CREATE INDEX "evidence_items_traceability_status_idx" ON "evidence_items"("traceability_status");

-- CreateIndex
CREATE INDEX "evidence_items_captured_at_idx" ON "evidence_items"("captured_at");

-- CreateIndex
CREATE INDEX "evidence_bundles_engagement_id_idx" ON "evidence_bundles"("engagement_id");

-- CreateIndex
CREATE INDEX "evidence_bundles_status_idx" ON "evidence_bundles"("status");

-- CreateIndex
CREATE INDEX "evidence_bundles_submitted_at_idx" ON "evidence_bundles"("submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_files_storage_key_key" ON "evidence_files"("storage_key");

-- CreateIndex
CREATE INDEX "evidence_files_evidence_item_id_idx" ON "evidence_files"("evidence_item_id");

-- CreateIndex
CREATE INDEX "evidence_files_storage_key_idx" ON "evidence_files"("storage_key");
