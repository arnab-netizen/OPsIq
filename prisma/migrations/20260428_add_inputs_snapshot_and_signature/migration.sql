-- AddColumn to operator_items
ALTER TABLE "operator_items" ADD COLUMN "inputs_snapshot" JSONB;
ALTER TABLE "operator_items" ADD COLUMN "signed_hash" TEXT;

-- CreateIndex
CREATE INDEX "operator_items_signed_hash_idx" ON "operator_items"("signed_hash");
