CREATE TABLE "controlled_learning_reviews" (
    "id" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "candidateId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reviewNotes" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controlled_learning_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "controlled_learning_reviews_workspaceId_idx" ON "controlled_learning_reviews"("workspaceId");
CREATE INDEX "controlled_learning_reviews_candidateId_idx" ON "controlled_learning_reviews"("candidateId");
CREATE INDEX "controlled_learning_reviews_decision_idx" ON "controlled_learning_reviews"("decision");

ALTER TABLE "controlled_learning_reviews" ADD CONSTRAINT "controlled_learning_reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlled_learning_reviews" ADD CONSTRAINT "controlled_learning_reviews_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
