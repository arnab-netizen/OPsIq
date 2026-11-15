-- D9: persist the three leakage components separately. ADDITIVE ONLY: nothing is rewritten, dropped, renamed or backfilled.
--
-- Why: the service merged refund + rework + complaint into the single "refund_rework_cost" column, so a stored snapshot
-- could never prove which components the owner had supplied and the leakage finding could never become complete.
--
-- Legacy rule (deliberate): existing rows keep leakage_component_version = NULL and all three component columns NULL.
-- A historical "refund_rework_cost" value is NOT assigned to any component and is NOT split: its composition was never
-- recorded, so UNKNOWN stays UNKNOWN. The legacy aggregate keeps contributing its known monetary amount only as an
-- explicitly ambiguous lower-bound figure in the application; a legacy row can never read as complete component coverage.
--
-- Deploy order: apply this migration BEFORE (or with) the application that reads/writes the new columns. It is backward
-- compatible, so the previous application keeps working against the migrated schema (it ignores the new columns and
-- keeps writing refund_rework_cost; such rows have a NULL version and are therefore read as legacy).
-- Rollback: revert the application; the columns are inert to older code. (Dropping them is a data-loss operation and is
-- deliberately NOT part of this migration.)

ALTER TABLE "owner_financial_snapshots"
  ADD COLUMN "refund_amount" DOUBLE PRECISION,
  ADD COLUMN "rework_cost" DOUBLE PRECISION,
  ADD COLUMN "complaint_cost" DOUBLE PRECISION,
  ADD COLUMN "leakage_component_version" INTEGER;

-- The marker is either NULL (legacy) or the single defined contract version; component values may exist only under that
-- contract, so a legacy row can never carry (or be given) a guessed component value. (The IS NOT NULL guard is deliberate:
-- a CHECK passes when its expression is NULL, and "NULL = 1" is NULL, which would let a NULL marker carry components.)
ALTER TABLE "owner_financial_snapshots"
  ADD CONSTRAINT "owner_fin_snapshots_leakage_component_contract_check"
  CHECK (
    ("leakage_component_version" IS NULL AND "refund_amount" IS NULL AND "rework_cost" IS NULL AND "complaint_cost" IS NULL)
    OR ("leakage_component_version" IS NOT NULL AND "leakage_component_version" = 1)
  );

ALTER TABLE "owner_financial_snapshots"
  ADD CONSTRAINT "owner_fin_snapshots_leakage_component_nonneg_check"
  CHECK (
    ("refund_amount" IS NULL OR "refund_amount" >= 0)
    AND ("rework_cost" IS NULL OR "rework_cost" >= 0)
    AND ("complaint_cost" IS NULL OR "complaint_cost" >= 0)
  );
