-- CreateTable "stages"
CREATE TABLE "stages" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocker_severity" TEXT,
    "blocker_type" TEXT,
    "blocker_reason" TEXT,
    "blocked_at" TIMESTAMP(3),
    "unblocked_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "owner_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable "evidence"
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "stage_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidence_type" TEXT,
    "severity_rating" TEXT,
    "collected_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "metadata" JSONB,
    "submitted_by" UUID,
    "validated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable "findings"
CREATE TABLE "findings" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "stage_id" UUID,
    "primary_evidence_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "impact_area" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'identified',
    "confidence_score" DOUBLE PRECISION,
    "priority_score" DOUBLE PRECISION,
    "hypothesis" TEXT,
    "root_cause" TEXT,
    "consequence" TEXT,
    "owner_id" UUID,
    "due_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable "recommendations"
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "stage_id" UUID,
    "finding_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "rationale" TEXT NOT NULL,
    "expected_impact" TEXT,
    "estimated_effort" TEXT,
    "target_metric" TEXT,
    "owner_id" UUID,
    "due_at" TIMESTAMP(3),
    "endorsed_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable "actions"
CREATE TABLE "actions" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "stage_id" UUID,
    "recommendation_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "assigned_to" UUID,
    "due_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stages_engagement_id_idx" ON "stages"("engagement_id");

-- CreateIndex
CREATE INDEX "stages_status_idx" ON "stages"("status");

-- CreateIndex
CREATE INDEX "stages_is_blocked_idx" ON "stages"("is_blocked");

-- CreateIndex
CREATE INDEX "evidence_engagement_id_idx" ON "evidence"("engagement_id");

-- CreateIndex
CREATE INDEX "evidence_stage_id_idx" ON "evidence"("stage_id");

-- CreateIndex
CREATE INDEX "evidence_status_idx" ON "evidence"("status");

-- CreateIndex
CREATE INDEX "findings_engagement_id_idx" ON "findings"("engagement_id");

-- CreateIndex
CREATE INDEX "findings_stage_id_idx" ON "findings"("stage_id");

-- CreateIndex
CREATE INDEX "findings_primary_evidence_id_idx" ON "findings"("primary_evidence_id");

-- CreateIndex
CREATE INDEX "findings_status_idx" ON "findings"("status");

-- CreateIndex
CREATE INDEX "findings_severity_idx" ON "findings"("severity");

-- CreateIndex
CREATE INDEX "findings_archived_at_idx" ON "findings"("archived_at");

-- CreateIndex
CREATE INDEX "findings_engagement_id_status_idx" ON "findings"("engagement_id", "status");

-- CreateIndex
CREATE INDEX "findings_engagement_id_severity_idx" ON "findings"("engagement_id", "severity");

-- CreateIndex
CREATE INDEX "recommendations_engagement_id_idx" ON "recommendations"("engagement_id");

-- CreateIndex
CREATE INDEX "recommendations_stage_id_idx" ON "recommendations"("stage_id");

-- CreateIndex
CREATE INDEX "recommendations_finding_id_idx" ON "recommendations"("finding_id");

-- CreateIndex
CREATE INDEX "recommendations_status_idx" ON "recommendations"("status");

-- CreateIndex
CREATE INDEX "recommendations_priority_idx" ON "recommendations"("priority");

-- CreateIndex
CREATE INDEX "recommendations_archived_at_idx" ON "recommendations"("archived_at");

-- CreateIndex
CREATE INDEX "recommendations_engagement_id_status_idx" ON "recommendations"("engagement_id", "status");

-- CreateIndex
CREATE INDEX "recommendations_finding_id_status_idx" ON "recommendations"("finding_id", "status");

-- CreateIndex
CREATE INDEX "actions_engagement_id_idx" ON "actions"("engagement_id");

-- CreateIndex
CREATE INDEX "actions_stage_id_idx" ON "actions"("stage_id");

-- CreateIndex
CREATE INDEX "actions_recommendation_id_idx" ON "actions"("recommendation_id");

-- CreateIndex
CREATE INDEX "actions_status_idx" ON "actions"("status");

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_primary_evidence_id_fkey" FOREIGN KEY ("primary_evidence_id") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
