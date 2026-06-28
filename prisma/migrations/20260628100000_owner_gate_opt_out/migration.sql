-- Jarvis 360 Slice 0 — owner safety gates become DEFAULT-ON at recommendation
-- promotion. Enforcement is skipped only via an explicit, audited owner opt-out.
-- Additive, idempotent, all-nullable: no change to existing rows.

ALTER TABLE "client_accounts"
  ADD COLUMN IF NOT EXISTS "owner_gate_opt_out_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "owner_gate_opt_out_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_gate_opt_out_by" UUID,
  ADD COLUMN IF NOT EXISTS "owner_gate_opt_out_risk" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_gate_opt_out_expires_at" TIMESTAMP(3);
