-- Bundle 3.4: Risk and Compliance Lifecycle + Task Integration
-- Extends business_risk_entries and owner_compliance_item with lifecycle fields.
-- Adds risk_task_links and compliance_task_links junction tables.
-- All additive. No destructive operations.

-- ─── BusinessRiskEntry extensions ────────────────────────────────────────────

ALTER TABLE "business_risk_entries"
  ADD COLUMN IF NOT EXISTS "mitigation_owner"      TEXT,
  ADD COLUMN IF NOT EXISTS "review_due_date"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "acceptance_rationale"   TEXT,
  ADD COLUMN IF NOT EXISTS "linked_startup_session_id" UUID,
  ADD COLUMN IF NOT EXISTS "origin_blueprint_id"   UUID,
  ADD COLUMN IF NOT EXISTS "origin_type"            TEXT;

-- ─── OwnerComplianceItem lifecycle extensions ─────────────────────────────────

ALTER TABLE "owner_compliance_item"
  ADD COLUMN IF NOT EXISTS "reviewed_at"            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reviewed_by"            UUID,
  ADD COLUMN IF NOT EXISTS "compliance_notes"       TEXT;

-- ─── Risk ↔ Task linkage ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "risk_task_links" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   UUID        NOT NULL,
  "risk_id"        UUID        NOT NULL,
  "task_id"        UUID        NOT NULL,
  "link_type"      TEXT        NOT NULL DEFAULT 'MITIGATION',  -- MITIGATION | EVIDENCE
  "linked_by"      UUID        NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "risk_task_links_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "risk_task_links_workspace_pair" UNIQUE ("workspace_id", "risk_id", "task_id")
);

CREATE INDEX IF NOT EXISTS "rtl_risk_idx"      ON "risk_task_links" ("workspace_id", "risk_id");
CREATE INDEX IF NOT EXISTS "rtl_task_idx"      ON "risk_task_links" ("workspace_id", "task_id");

-- ─── Compliance ↔ Task linkage ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "compliance_task_links" (
  "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"          UUID        NOT NULL,
  "compliance_item_id"    UUID        NOT NULL,
  "task_id"               UUID        NOT NULL,
  "link_type"             TEXT        NOT NULL DEFAULT 'REMEDIATION',  -- REMEDIATION | EVIDENCE
  "linked_by"             UUID        NOT NULL,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "compliance_task_links_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "compliance_task_links_workspace_pair" UNIQUE ("workspace_id", "compliance_item_id", "task_id")
);

CREATE INDEX IF NOT EXISTS "ctl_compliance_idx" ON "compliance_task_links" ("workspace_id", "compliance_item_id");
CREATE INDEX IF NOT EXISTS "ctl_task_idx"        ON "compliance_task_links" ("workspace_id", "task_id");
