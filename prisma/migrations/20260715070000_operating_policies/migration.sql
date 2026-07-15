-- Phase 7: Governed Operating Policy Registry
-- Owner-configurable per-workspace policies that gate expenditure and growth decisions.
-- Policy evaluation returns ALLOW / WARN / BLOCK.
-- Overrides are time-limited and owner-approved; every change emits an audit event.

CREATE TABLE "operating_policies" (
    "id"                            UUID    NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id"                  UUID    NOT NULL,
    "policy_key"                    TEXT    NOT NULL,
    "category"                      TEXT    NOT NULL,
    "description"                   TEXT    NOT NULL,
    "threshold"                     DOUBLE PRECISION NOT NULL,
    "threshold_unit"                TEXT    NOT NULL,
    "hard_block"                    BOOLEAN NOT NULL DEFAULT false,
    "override_authority_role"       TEXT    NOT NULL,
    "override_reason_required"      BOOLEAN NOT NULL DEFAULT true,
    "expiry_after_override_minutes" INTEGER,
    "is_active"                     BOOLEAN NOT NULL DEFAULT true,
    "created_by"                    UUID    NOT NULL,
    "created_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operating_policy_overrides" (
    "id"             UUID    NOT NULL DEFAULT gen_random_uuid(),
    "policy_id"      UUID    NOT NULL,
    "workspace_id"   UUID    NOT NULL,
    "overridden_by"  UUID    NOT NULL,
    "reason"         TEXT    NOT NULL,
    "context"        JSONB   NOT NULL DEFAULT '{}',
    "expires_at"     TIMESTAMP(3),
    "revoked_at"     TIMESTAMP(3),
    "revoked_by"     UUID,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operating_policy_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operating_policies_workspace_id_policy_key_key"
    ON "operating_policies"("workspace_id", "policy_key");

CREATE INDEX "operating_policies_workspace_id_is_active_idx"
    ON "operating_policies"("workspace_id", "is_active");

CREATE INDEX "operating_policy_overrides_policy_id_idx"
    ON "operating_policy_overrides"("policy_id");

CREATE INDEX "operating_policy_overrides_workspace_id_expires_at_idx"
    ON "operating_policy_overrides"("workspace_id", "expires_at");

ALTER TABLE "operating_policies"
    ADD CONSTRAINT "operating_policies_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operating_policy_overrides"
    ADD CONSTRAINT "operating_policy_overrides_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operating_policy_overrides"
    ADD CONSTRAINT "operating_policy_overrides_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "operating_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
