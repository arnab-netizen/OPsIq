-- Evolve idempotency_records table from init version
-- Note: init migration created basic schema and indexes; this adds payload column

-- AddColumn to idempotency_records
ALTER TABLE "idempotency_records" ADD COLUMN "payload" TEXT;
