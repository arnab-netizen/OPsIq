-- Phase 4 concurrency fix: add idempotency_key to resource_allocations.
-- Enables safe duplicate-request detection inside the locked transaction.
-- Column is nullable (existing rows unaffected) and unique (no duplicate keys).

ALTER TABLE "resource_allocations"
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "resource_allocations_idempotency_key_key"
  ON "resource_allocations"("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
