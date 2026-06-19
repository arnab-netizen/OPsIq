-- Phase 33: Controlled Learning Regression Results
-- CreateTable
CREATE TABLE "controlled_learning_regression_results" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "testVerdict" TEXT NOT NULL,
    "regressionScore" DOUBLE PRECISION NOT NULL,
    "testedBy" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL,
    "testNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controlled_learning_regression_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controlled_learning_regression_results_workspaceId_idx" ON "controlled_learning_regression_results"("workspaceId");

-- CreateIndex
CREATE INDEX "controlled_learning_regression_results_candidateId_idx" ON "controlled_learning_regression_results"("candidateId");

-- CreateIndex
CREATE INDEX "controlled_learning_regression_results_testVerdict_idx" ON "controlled_learning_regression_results"("testVerdict");

-- AddForeignKey
ALTER TABLE "controlled_learning_regression_results" ADD CONSTRAINT "controlled_learning_regression_results_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_learning_regression_results" ADD CONSTRAINT "controlled_learning_regression_results_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
