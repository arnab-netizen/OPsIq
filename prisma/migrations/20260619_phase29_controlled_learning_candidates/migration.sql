CREATE TABLE "controlled_learning_candidates" (
    "id" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceRecommendationId" TEXT,
    "sourceOwnerDecisionId" TEXT NOT NULL,
    "sourceActionId" TEXT NOT NULL,
    "sourceOutcomeId" TEXT NOT NULL,
    "eligibilityStatus" TEXT NOT NULL,
    "rejectionReasons" TEXT NOT NULL,
    "evidenceSourceType" TEXT NOT NULL,
    "evidenceSummary" TEXT NOT NULL,
    "humanReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewerId" TEXT,
    "promotionLocked" BOOLEAN NOT NULL DEFAULT false,
    "promotedAt" TIMESTAMP(3),
    "auditFingerprint" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "controlled_learning_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "controlled_learning_candidate_audit_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "candidateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "detail" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "controlled_learning_candidate_audit_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "controlled_learning_candidates_workspaceId_auditFingerprint_key" ON "controlled_learning_candidates"("workspaceId", "auditFingerprint");
CREATE INDEX "controlled_learning_candidates_workspaceId_idx" ON "controlled_learning_candidates"("workspaceId");
CREATE INDEX "controlled_learning_candidates_businessId_idx" ON "controlled_learning_candidates"("businessId");
CREATE INDEX "controlled_learning_candidates_eligibilityStatus_idx" ON "controlled_learning_candidates"("eligibilityStatus");
CREATE INDEX "controlled_learning_candidates_promotionLocked_idx" ON "controlled_learning_candidates"("promotionLocked");
CREATE INDEX "controlled_learning_candidate_audit_entries_workspaceId_idx" ON "controlled_learning_candidate_audit_entries"("workspaceId");
CREATE INDEX "controlled_learning_candidate_audit_entries_candidateId_idx" ON "controlled_learning_candidate_audit_entries"("candidateId");
CREATE INDEX "controlled_learning_candidate_audit_entries_action_idx" ON "controlled_learning_candidate_audit_entries"("action");

ALTER TABLE "controlled_learning_candidates" ADD CONSTRAINT "controlled_learning_candidates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_learning_candidate_audit_entries" ADD CONSTRAINT "controlled_learning_candidate_audit_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_learning_candidate_audit_entries" ADD CONSTRAINT "controlled_learning_candidate_audit_entries_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
