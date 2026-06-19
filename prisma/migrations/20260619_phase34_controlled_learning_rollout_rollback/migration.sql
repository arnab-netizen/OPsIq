-- CreateTable
CREATE TABLE "controlled_learning_rollout_flags" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "rolloutStage" TEXT NOT NULL,
    "rolloutPct" DOUBLE PRECISION NOT NULL,
    "enabledBy" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL,
    "flagNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controlled_learning_rollout_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controlled_learning_rollback_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "rolledBackBy" TEXT NOT NULL,
    "rolledBackAt" TIMESTAMP(3) NOT NULL,
    "rollbackReason" TEXT NOT NULL,
    "rollbackCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controlled_learning_rollback_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "controlled_learning_rollout_flags_workspaceId_candidateId_key" ON "controlled_learning_rollout_flags"("workspaceId", "candidateId");

-- CreateIndex
CREATE INDEX "controlled_learning_rollout_flags_workspaceId_idx" ON "controlled_learning_rollout_flags"("workspaceId");

-- CreateIndex
CREATE INDEX "controlled_learning_rollout_flags_candidateId_idx" ON "controlled_learning_rollout_flags"("candidateId");

-- CreateIndex
CREATE INDEX "controlled_learning_rollout_flags_rolloutStage_idx" ON "controlled_learning_rollout_flags"("rolloutStage");

-- CreateIndex
CREATE INDEX "controlled_learning_rollback_events_workspaceId_idx" ON "controlled_learning_rollback_events"("workspaceId");

-- CreateIndex
CREATE INDEX "controlled_learning_rollback_events_candidateId_idx" ON "controlled_learning_rollback_events"("candidateId");

-- CreateIndex
CREATE INDEX "controlled_learning_rollback_events_rollbackCode_idx" ON "controlled_learning_rollback_events"("rollbackCode");

-- AddForeignKey
ALTER TABLE "controlled_learning_rollout_flags" ADD CONSTRAINT "controlled_learning_rollout_flags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_learning_rollout_flags" ADD CONSTRAINT "controlled_learning_rollout_flags_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_learning_rollback_events" ADD CONSTRAINT "controlled_learning_rollback_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "client_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_learning_rollback_events" ADD CONSTRAINT "controlled_learning_rollback_events_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "controlled_learning_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
