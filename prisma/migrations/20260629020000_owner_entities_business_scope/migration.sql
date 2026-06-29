-- Business-scoped owner-mode entities migration (additive, staged, reversible).
--
-- One owner workspace may contain multiple businesses / branches / locations. These four owner-mode
-- entities were workspace-scoped only, which let capacity / workload / proof / standing-instruction state
-- bleed across businesses inside one workspace. Add a NULLABLE business_id so:
--   * new writes are business-scoped (set from validated owner/business context),
--   * provider reads scope by (workspace_id, business_id),
--   * legacy rows (business_id IS NULL) are never surfaced as a business's real data.
-- No NOT NULL is forced and no data is dropped: legacy rows keep business_id = NULL and remain queryable.

-- OwnerCapacitySnapshot
ALTER TABLE "owner_capacity_snapshots" ADD COLUMN IF NOT EXISTS "business_id" UUID;
CREATE INDEX IF NOT EXISTS "owner_capacity_snapshots_workspace_id_business_id_idx"
  ON "owner_capacity_snapshots" ("workspace_id", "business_id");

-- OwnerWorkloadSnapshot
ALTER TABLE "owner_workload_snapshots" ADD COLUMN IF NOT EXISTS "business_id" UUID;
CREATE INDEX IF NOT EXISTS "owner_workload_snapshots_workspace_id_business_id_idx"
  ON "owner_workload_snapshots" ("workspace_id", "business_id");

-- Proof
ALTER TABLE "proofs" ADD COLUMN IF NOT EXISTS "business_id" UUID;
CREATE INDEX IF NOT EXISTS "proofs_workspace_id_business_id_idx"
  ON "proofs" ("workspace_id", "business_id");

-- OwnerStandingInstruction
ALTER TABLE "owner_standing_instruction" ADD COLUMN IF NOT EXISTS "business_id" UUID;
CREATE INDEX IF NOT EXISTS "owner_standing_instruction_workspace_id_business_id_idx"
  ON "owner_standing_instruction" ("workspace_id", "business_id");
