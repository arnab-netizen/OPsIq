-- Evolve idempotency_records table from init version
-- Note: init migration created basic version; this adds payload column and missing index

-- AddColumn to idempotency_records
ALTER TABLE "idempotency_records" ADD COLUMN "payload" TEXT;

-- CreateIndex (if not already created)
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_idempotency_key_key" ON "idempotency_records"("idempotency_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idempotency_records_idempotency_key_idx" ON "idempotency_records"("idempotency_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");
