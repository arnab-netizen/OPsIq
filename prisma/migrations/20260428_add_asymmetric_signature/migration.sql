-- CreateTable "operator_items" (moved here to run before ALTER statements)
CREATE TABLE "operator_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "created_by_user_id" UUID,
    "last_updated_by_user_id" UUID,
    "assigned_to_user_id" UUID,
    "reviewed_by_user_id" UUID,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operator_items_status_idx" ON "operator_items"("status");
CREATE INDEX "operator_items_created_at_idx" ON "operator_items"("created_at");
CREATE INDEX "operator_items_decision_hash_idx" ON "operator_items"("decision_hash");

-- AddColumn to operator_items for asymmetric signature
ALTER TABLE "operator_items" ADD COLUMN "signature" TEXT;
ALTER TABLE "operator_items" ADD COLUMN "signature_algo" TEXT;
ALTER TABLE "operator_items" ADD COLUMN "public_key_id" TEXT;

-- CreateIndex
CREATE INDEX "operator_items_public_key_id_idx" ON "operator_items"("public_key_id");
