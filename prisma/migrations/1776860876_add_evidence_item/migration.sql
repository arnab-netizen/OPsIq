-- CreateTable EvidenceItem
CREATE TABLE "evidence_items" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "shock_event_id" UUID,
    "category" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "visibility_classification" TEXT NOT NULL,
    "recorded_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_items_engagement_id_idx" ON "evidence_items"("engagement_id");

-- CreateIndex
CREATE INDEX "evidence_items_category_idx" ON "evidence_items"("category");

-- CreateIndex
CREATE INDEX "evidence_items_source_type_idx" ON "evidence_items"("source_type");

-- CreateIndex
CREATE INDEX "evidence_items_shock_event_id_idx" ON "evidence_items"("shock_event_id");

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_shock_event_id_fkey" FOREIGN KEY ("shock_event_id") REFERENCES "shock_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
