-- Phase 6: Google Sheets Spreadsheet Allowlist
-- Owner must explicitly allow each spreadsheet before it can be imported.
-- Revoking is soft-delete (revokedAt) — preserves audit history.

CREATE TABLE "external_spreadsheet_allowlist" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id"   UUID NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "added_by"       UUID NOT NULL,
    "revoked_at"     TIMESTAMP(3),
    "revoked_by"     UUID,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_spreadsheet_allowlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_spreadsheet_allowlist_workspace_id_spreadsheet_id_key"
    ON "external_spreadsheet_allowlist"("workspace_id", "spreadsheet_id");

CREATE INDEX "external_spreadsheet_allowlist_workspace_id_idx"
    ON "external_spreadsheet_allowlist"("workspace_id");

ALTER TABLE "external_spreadsheet_allowlist"
    ADD CONSTRAINT "external_spreadsheet_allowlist_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
