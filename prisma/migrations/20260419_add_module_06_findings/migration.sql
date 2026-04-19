-- CreateTable findings
CREATE TABLE "findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "stage_id" UUID,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "severity_validated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "status_updated_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "confidence_label" TEXT NOT NULL,
    "confidence_status" TEXT NOT NULL DEFAULT 'provisional',
    "client_visibility_status" TEXT NOT NULL DEFAULT 'internal',
    "supersedes_finding_id" UUID,
    "issue_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "findings_no_self_supersession" CHECK ("supersedes_finding_id" IS NULL OR "supersedes_finding_id" != "id"),
    CONSTRAINT "findings_superseded_requires_chain" CHECK ("status" != 'superseded' OR "supersedes_finding_id" IS NOT NULL)
);

-- CreateTable finding_evidence_links
CREATE TABLE "finding_evidence_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "finding_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "finding_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "findings_engagement_id_idx" ON "findings"("engagement_id");

-- CreateIndex
CREATE INDEX "findings_engagement_id_status_idx" ON "findings"("engagement_id", "status");

-- CreateIndex
CREATE INDEX "findings_engagement_id_severity_idx" ON "findings"("engagement_id", "severity");

-- CreateIndex
CREATE INDEX "findings_engagement_id_confidence_status_idx" ON "findings"("engagement_id", "confidence_status");

-- CreateIndex
CREATE INDEX "findings_issue_id_status_idx" ON "findings"("issue_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finding_evidence_links_finding_id_evidence_id_key" ON "finding_evidence_links"("finding_id", "evidence_id");

-- CreateIndex
CREATE INDEX "finding_evidence_links_finding_id_idx" ON "finding_evidence_links"("finding_id");

-- CreateIndex
CREATE INDEX "finding_evidence_links_evidence_id_idx" ON "finding_evidence_links"("evidence_id");

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_supersedes_finding_id_fkey" FOREIGN KEY ("supersedes_finding_id") REFERENCES "findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_evidence_links" ADD CONSTRAINT "finding_evidence_links_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
