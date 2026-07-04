-- DEC-TEN-01 / SCHEMA-01/03: add a real workspace anchor to ClientAccount and LeadRecord.
-- The service/route layer already scopes these by verifiedWorkspaceId; the column was
-- missing (schema drift), so every clients/leads create/read/update threw. This adds the
-- column, backfills from existing engagement/client relations, and enforces NOT NULL + FK.

-- ClientAccount ---------------------------------------------------------------
ALTER TABLE "client_accounts" ADD COLUMN "workspace_id" UUID;

UPDATE "client_accounts" c
SET "workspace_id" = e."workspace_id"
FROM "engagements" e
WHERE e."client_id" = c."id" AND c."workspace_id" IS NULL;

-- Any rows still NULL cannot be safely anchored automatically; SET NOT NULL will fail
-- and requires a manual/owner backfill first (documented in DEC_TEN_01_FINAL...).
ALTER TABLE "client_accounts" ALTER COLUMN "workspace_id" SET NOT NULL;
CREATE INDEX "client_accounts_workspace_id_idx" ON "client_accounts"("workspace_id");
ALTER TABLE "client_accounts"
  ADD CONSTRAINT "client_accounts_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LeadRecord ------------------------------------------------------------------
ALTER TABLE "lead_records" ADD COLUMN "workspace_id" UUID;

UPDATE "lead_records" l
SET "workspace_id" = e."workspace_id"
FROM "engagements" e
WHERE l."engagement_id" = e."id" AND l."workspace_id" IS NULL;

UPDATE "lead_records" l
SET "workspace_id" = c."workspace_id"
FROM "client_accounts" c
WHERE l."converted_to_client_id" = c."id" AND l."workspace_id" IS NULL;

ALTER TABLE "lead_records" ALTER COLUMN "workspace_id" SET NOT NULL;
CREATE INDEX "lead_records_workspace_id_idx" ON "lead_records"("workspace_id");
ALTER TABLE "lead_records"
  ADD CONSTRAINT "lead_records_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
