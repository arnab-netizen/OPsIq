-- DEC-TEN-01 / SCHEMA-01/03: add a workspace anchor to ClientAccount and LeadRecord.
-- The service/route layer already scopes these by verifiedWorkspaceId (fail-closed); the
-- column was missing (schema drift), so clients/leads create/read/update threw. This adds a
-- NULLABLE transitional column + backfill + FK + index. It is intentionally NOT NULL-enforced
-- yet: existing rows without a derivable workspace stay NULL (service-inaccessible / fail-closed)
-- until an owner backfill migration flips it to NOT NULL. See DEC_TEN_01_FINAL...md.

ALTER TABLE "client_accounts" ADD COLUMN "workspace_id" UUID;
UPDATE "client_accounts" c SET "workspace_id" = e."workspace_id"
FROM "engagements" e WHERE e."client_id" = c."id" AND c."workspace_id" IS NULL;
CREATE INDEX "client_accounts_workspace_id_idx" ON "client_accounts"("workspace_id");
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_records" ADD COLUMN "workspace_id" UUID;
UPDATE "lead_records" l SET "workspace_id" = e."workspace_id"
FROM "engagements" e WHERE l."engagement_id" = e."id" AND l."workspace_id" IS NULL;
UPDATE "lead_records" l SET "workspace_id" = c."workspace_id"
FROM "client_accounts" c WHERE l."converted_to_client_id" = c."id" AND l."workspace_id" IS NULL;
CREATE INDEX "lead_records_workspace_id_idx" ON "lead_records"("workspace_id");
ALTER TABLE "lead_records" ADD CONSTRAINT "lead_records_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
