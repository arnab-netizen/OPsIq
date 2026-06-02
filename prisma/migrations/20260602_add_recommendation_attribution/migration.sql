-- Add recommendation attribution to operator_items table

ALTER TABLE "operator_items" ADD COLUMN "recommendation_id" UUID;

-- Add foreign key constraint
ALTER TABLE "operator_items"
ADD CONSTRAINT "operator_items_recommendation_id_fkey"
FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE SET NULL;

-- Index for recommendation lookups
CREATE INDEX "operator_items_recommendation_id_idx" ON "operator_items"("recommendation_id");

-- Composite index for finding outcomes by recommendation
CREATE INDEX "operator_items_recommendation_status_idx" ON "operator_items"("recommendation_id", "status");
