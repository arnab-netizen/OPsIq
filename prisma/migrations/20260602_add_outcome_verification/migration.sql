-- Add outcome verification fields to operator_items table

ALTER TABLE "operator_items" ADD COLUMN "verification_status" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "operator_items" ADD COLUMN "verification_method" TEXT;
ALTER TABLE "operator_items" ADD COLUMN "verification_evidence" JSONB;
ALTER TABLE "operator_items" ADD COLUMN "verification_confidence" DOUBLE PRECISION;
ALTER TABLE "operator_items" ADD COLUMN "verified_at" TIMESTAMP(3);
ALTER TABLE "operator_items" ADD COLUMN "audit_trail" JSONB;

-- Index for verification status queries
CREATE INDEX "operator_items_verification_status_idx" ON "operator_items"("verification_status");

-- Composite index for finding unverified items
CREATE INDEX "operator_items_status_verification_idx" ON "operator_items"("status", "verification_status");
