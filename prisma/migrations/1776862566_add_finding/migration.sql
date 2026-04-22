-- CreateTable Finding
CREATE TABLE "findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "shock_event_id" UUID,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rationale" TEXT,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable FindingEvidenceLink
CREATE TABLE "finding_evidence_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "finding_id" UUID NOT NULL,
    "evidence_item_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex findings_engagement_id
CREATE INDEX "findings_engagement_id_idx" ON "findings"("engagement_id");

-- CreateIndex findings_severity
CREATE INDEX "findings_severity_idx" ON "findings"("severity");

-- CreateIndex findings_status
CREATE INDEX "findings_status_idx" ON "findings"("status");

-- CreateIndex findings_shock_event_id
CREATE INDEX "findings_shock_event_id_idx" ON "findings"("shock_event_id");

-- CreateIndex finding_evidence_links_finding_id
CREATE INDEX "finding_evidence_links_finding_id_idx" ON "finding_evidence_links"("finding_id");

-- CreateIndex finding_evidence_links_evidence_item_id
CREATE INDEX "finding_evidence_links_evidence_item_id_idx" ON "finding_evidence_links"("evidence_item_id");

-- CreateIndex finding_evidence_links_unique
CREATE UNIQUE INDEX "finding_evidence_links_finding_id_evidence_item_id_key" ON "finding_evidence_links"("finding_id", "evidence_item_id");

-- AddForeignKey findings_engagement_id
ALTER TABLE "findings" ADD CONSTRAINT "findings_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey findings_shock_event_id
ALTER TABLE "findings" ADD CONSTRAINT "findings_shock_event_id_fkey" FOREIGN KEY ("shock_event_id") REFERENCES "shock_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey finding_evidence_links_finding_id
ALTER TABLE "finding_evidence_links" ADD CONSTRAINT "finding_evidence_links_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey finding_evidence_links_evidence_item_id
ALTER TABLE "finding_evidence_links" ADD CONSTRAINT "finding_evidence_links_evidence_item_id_fkey" FOREIGN KEY ("evidence_item_id") REFERENCES "evidence_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
