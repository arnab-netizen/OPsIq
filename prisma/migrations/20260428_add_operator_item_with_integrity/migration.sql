-- CreateTable "operator_items"
CREATE TABLE "operator_items" (
    "id" UUID NOT NULL,
    "problem" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "impactExpected" DOUBLE PRECISION NOT NULL,
    "impactLow" DOUBLE PRECISION NOT NULL,
    "impactHigh" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "priorityScore" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_at" TIMESTAMP(3),
    "expected_outcome" TEXT,
    "actual_outcome" TEXT,
    "explanation" JSONB,
    "decision_hash" TEXT,
    "engine_version" TEXT NOT NULL DEFAULT 'v1.0.0',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operator_items_status_idx" ON "operator_items"("status");

-- CreateIndex
CREATE INDEX "operator_items_created_at_idx" ON "operator_items"("created_at");

-- CreateIndex
CREATE INDEX "operator_items_decision_hash_idx" ON "operator_items"("decision_hash");
