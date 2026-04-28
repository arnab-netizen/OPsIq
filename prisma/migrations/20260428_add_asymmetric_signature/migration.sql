-- AddColumn to operator_items for asymmetric signature
ALTER TABLE "operator_items" ADD COLUMN "signature" TEXT;
ALTER TABLE "operator_items" ADD COLUMN "signature_algo" TEXT;
ALTER TABLE "operator_items" ADD COLUMN "public_key_id" TEXT;

-- CreateIndex
CREATE INDEX "operator_items_public_key_id_idx" ON "operator_items"("public_key_id");
