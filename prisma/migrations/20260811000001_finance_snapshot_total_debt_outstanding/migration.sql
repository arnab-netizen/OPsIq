-- Forward-only additive migration: add total_debt_outstanding to owner_financial_snapshots.
-- This column stores the owner-reported total outstanding loan/debt principal balance,
-- distinct from debt_payments (the periodic EMI/repayment amount). Additive only — no
-- existing column is renamed, dropped, or modified.

ALTER TABLE "owner_financial_snapshots"
  ADD COLUMN IF NOT EXISTS "total_debt_outstanding" DOUBLE PRECISION;
