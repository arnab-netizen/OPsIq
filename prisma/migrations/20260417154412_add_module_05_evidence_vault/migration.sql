-- CreateEnum
CREATE TYPE "evidence_category" AS ENUM ('FINANCIAL', 'OPERATIONAL', 'HUMAN', 'RESILIENCE', 'CLIENT', 'COMMERCIAL', 'LEADERSHIP', 'EXECUTION');

-- CreateEnum
CREATE TYPE "evidence_type" AS ENUM ('FREE_TEXT', 'DOCUMENT', 'INTERVIEW', 'METRICS', 'SYSTEM', 'APPROVAL');

-- CreateEnum
CREATE TYPE "evidence_source_type" AS ENUM ('PERSON', 'DOCUMENT', 'SYSTEM', 'REPORT');

-- CreateEnum
CREATE TYPE "evidence_capture_method" AS ENUM ('MANUAL', 'UPLOAD', 'INTEGRATION', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "evidence_validation_status" AS ENUM ('PENDING', 'VALIDATED', 'INVALID');

-- CreateEnum
CREATE TYPE "evidence_traceability_status" AS ENUM ('COMPLETE', 'PARTIAL', 'MISSING');

-- CreateEnum
CREATE TYPE "evidence_visibility" AS ENUM ('INTERNAL', 'CLIENT_VISIBLE', 'RESTRICTED');

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "category" "evidence_category" NOT NULL,
    "evidence_type" "evidence_type" NOT NULL,
    "source_type" "evidence_source_type" NOT NULL,
    "source_label" TEXT NOT NULL,
    "source_contact_id" UUID,
    "capture_method" "evidence_capture_method" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "validation_status" "evidence_validation_status" NOT NULL DEFAULT 'PENDING',
    "traceability_status" "evidence_traceability_status" NOT NULL,
    "visibility" "evidence_visibility" NOT NULL DEFAULT 'INTERNAL',
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_blobs" (
    "id" UUID NOT NULL,
    "evidence_item_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_blobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_bundles" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_bundle_items" (
    "id" UUID NOT NULL,
    "bundle_id" UUID NOT NULL,
    "evidence_item_id" UUID NOT NULL,
    "added_by" UUID,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "evidence_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_items_engagement_id_idx" ON "evidence_items"("engagement_id");

-- CreateIndex
CREATE INDEX "evidence_items_category_idx" ON "evidence_items"("category");

-- CreateIndex
CREATE INDEX "evidence_items_validation_status_idx" ON "evidence_items"("validation_status");

-- CreateIndex
CREATE INDEX "evidence_items_visibility_idx" ON "evidence_items"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "file_blobs_evidence_item_id_key" ON "file_blobs"("evidence_item_id");

-- CreateIndex
CREATE INDEX "file_blobs_evidence_item_id_idx" ON "file_blobs"("evidence_item_id");

-- CreateIndex
CREATE INDEX "evidence_bundles_engagement_id_idx" ON "evidence_bundles"("engagement_id");

-- CreateIndex
CREATE INDEX "evidence_bundles_status_idx" ON "evidence_bundles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_bundle_items_bundle_id_evidence_item_id_key" ON "evidence_bundle_items"("bundle_id", "evidence_item_id");

-- CreateIndex
CREATE INDEX "evidence_bundle_items_bundle_id_idx" ON "evidence_bundle_items"("bundle_id");

-- CreateIndex
CREATE INDEX "evidence_bundle_items_evidence_item_id_idx" ON "evidence_bundle_items"("evidence_item_id");

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_source_contact_id_fkey" FOREIGN KEY ("source_contact_id") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_blobs" ADD CONSTRAINT "file_blobs_evidence_item_id_fkey" FOREIGN KEY ("evidence_item_id") REFERENCES "evidence_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundle_items" ADD CONSTRAINT "evidence_bundle_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "evidence_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_bundle_items" ADD CONSTRAINT "evidence_bundle_items_evidence_item_id_fkey" FOREIGN KEY ("evidence_item_id") REFERENCES "evidence_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
