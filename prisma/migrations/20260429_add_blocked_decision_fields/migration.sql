-- AlterTable: Add blocked decision tracking fields to operator_items
ALTER TABLE "operator_items"
ADD COLUMN "block_stage" TEXT,
ADD COLUMN "block_reason" TEXT,
ADD COLUMN "control_layer_violations" JSONB,
ADD COLUMN "gate_result" JSONB,
ADD COLUMN "guardrail_result" JSONB;

-- CreateIndex: Add indexes for efficient querying of blocked decisions
CREATE INDEX "operator_items_block_stage_idx" ON "operator_items"("block_stage");
CREATE INDEX "operator_items_workspace_block_stage_idx" ON "operator_items"("workspace_id", "block_stage");
