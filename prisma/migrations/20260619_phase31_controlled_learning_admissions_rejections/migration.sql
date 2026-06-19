CREATE TABLE "controlled_learning_admissions" (
    "id" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "candidateId" TEXT NOT NULL,
    "admittedBy" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "evidenceOrigin" TEXT NOT NULL,
    "eligibilityStatus" TEXT NOT NULL,
    "admissionNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "controlled_learning_admissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "controlled_learning_admissions_workspaceId_candidateId_key" ON "controlled_learning_admissions"("workspaceId", "candidateId");
CREATE INDEX "controlled_learning_admissions_workspaceId_idx" ON "controlled_learning_admissions"("workspaceId");
CREATE INDEX "controlled_learning_admissions_candidateId_idx" ON "controlled_learning_admissions"("candidateId");

ALTER TABLE "controlled_learning_admissions" ADD CONSTRAINT "controlled_learning_admissions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_learning_admissions" ADD CONSTRAINT "controlled_learning_admissions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "controlled_learning_rejections" (
    "id" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "candidateId" TEXT NOT NULL,
    "rejectedBy" TEXT NOT NULL,
    "rejectedAt" TIMESTAMP(3) NOT NULL,
    "rejectionReason" TEXT NOT NULL,
    "rejectionCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "controlled_learning_rejections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "controlled_learning_rejections_workspaceId_candidateId_key" ON "controlled_learning_rejections"("workspaceId", "candidateId");
CREATE INDEX "controlled_learning_rejections_workspaceId_idx" ON "controlled_learning_rejections"("workspaceId");
CREATE INDEX "controlled_learning_rejections_candidateId_idx" ON "controlled_learning_rejections"("candidateId");

ALTER TABLE "controlled_learning_rejections" ADD CONSTRAINT "controlled_learning_rejections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_learning_rejections" ADD CONSTRAINT "controlled_learning_rejections_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
