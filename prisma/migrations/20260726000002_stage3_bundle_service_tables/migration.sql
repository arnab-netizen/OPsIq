-- Stage 3 Bundle Service Tables (3.5–3.9)
-- Additive only. All tables use IF NOT EXISTS.
-- Corresponds to Prisma models added to schema.prisma without accompanying migration files.

-- ─── Bundle 3.5 — Customer Complaint and Recovery ────────────────────────────

CREATE TABLE IF NOT EXISTS "customer_complaints" (
  "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"          UUID          NOT NULL,
  "idempotency_key"       TEXT          NOT NULL,
  "status"                TEXT          NOT NULL DEFAULT 'OPEN',
  "title"                 TEXT          NOT NULL,
  "description"           TEXT          NOT NULL,
  "channel"               TEXT          NOT NULL DEFAULT 'DIRECT',
  "severity"              TEXT,
  "sla_due_at"            TIMESTAMP(3),
  "sla_breach"            BOOLEAN       NOT NULL DEFAULT false,
  "triage_notes"          TEXT,
  "resolution_summary"    TEXT,
  "resolution_evidence_id" UUID,
  "business_id"           UUID,
  "reported_by"           TEXT,
  "created_by"            UUID          NOT NULL,
  "updated_by"            UUID,
  "created_at"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "customer_complaints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_complaints_workspace_idem"
  ON "customer_complaints" ("workspace_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "cc_ws_status_idx"    ON "customer_complaints" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "cc_ws_severity_idx"  ON "customer_complaints" ("workspace_id", "severity");
CREATE INDEX IF NOT EXISTS "cc_ws_sla_due_idx"   ON "customer_complaints" ("workspace_id", "sla_due_at");
CREATE INDEX IF NOT EXISTS "cc_ws_sla_breach_idx" ON "customer_complaints" ("workspace_id", "sla_breach");
CREATE INDEX IF NOT EXISTS "cc_ws_created_idx"   ON "customer_complaints" ("workspace_id", "created_at");

-- Recovery actions are append-only children of a complaint.
CREATE TABLE IF NOT EXISTS "complaint_recovery_actions" (
  "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  UUID          NOT NULL,
  "complaint_id"  UUID          NOT NULL,
  "description"   TEXT          NOT NULL,
  "assigned_to"   TEXT,
  "due_at"        TIMESTAMP(3),
  "completed_at"  TIMESTAMP(3),
  "evidence_note" TEXT,
  "created_by"    UUID          NOT NULL,
  "created_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "complaint_recovery_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cra_complaint_fk" FOREIGN KEY ("complaint_id")
    REFERENCES "customer_complaints"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "cra_ws_complaint_idx"   ON "complaint_recovery_actions" ("workspace_id", "complaint_id");
CREATE INDEX IF NOT EXISTS "cra_ws_completed_idx"   ON "complaint_recovery_actions" ("workspace_id", "completed_at");

-- ─── Bundle 3.6 — Owner Action Assignment ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "owner_action_assignments" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    UUID          NOT NULL,
  "business_id"     UUID          NOT NULL,
  "idempotency_key" TEXT          NOT NULL,
  "action_id"       TEXT          NOT NULL,
  "action_domain"   TEXT          NOT NULL,
  "assigned_to"     TEXT          NOT NULL,
  "assigned_by_id"  UUID          NOT NULL,
  "priority"        TEXT          NOT NULL DEFAULT 'MEDIUM',
  "due_at"          TIMESTAMP(3),
  "status"          TEXT          NOT NULL DEFAULT 'ASSIGNED',
  "stall_detected"  BOOLEAN       NOT NULL DEFAULT false,
  "outcome_note"    TEXT,
  "reassign_reason" TEXT,
  "created_by"      UUID          NOT NULL,
  "updated_by"      UUID,
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "owner_action_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "owner_action_assignments_ws_idem"
  ON "owner_action_assignments" ("workspace_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "oaa_ws_status_idx"   ON "owner_action_assignments" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "oaa_ws_biz_idx"      ON "owner_action_assignments" ("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "oaa_ws_asgn_idx"     ON "owner_action_assignments" ("workspace_id", "assigned_to");
CREATE INDEX IF NOT EXISTS "oaa_ws_due_idx"      ON "owner_action_assignments" ("workspace_id", "due_at");
CREATE INDEX IF NOT EXISTS "oaa_ws_stall_idx"    ON "owner_action_assignments" ("workspace_id", "stall_detected");

-- ─── Bundle 3.7 — Approval Resolution and Evidence Chain ─────────────────────

CREATE TABLE IF NOT EXISTS "owner_approval_requests" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"     UUID          NOT NULL,
  "idempotency_key"  TEXT          NOT NULL,
  "business_id"      UUID          NOT NULL,
  "action_id"        TEXT,
  "action_domain"    TEXT,
  "requested_by"     UUID          NOT NULL,
  "status"           TEXT          NOT NULL DEFAULT 'PENDING',
  "rationale"        TEXT,
  "decided_by_id"    UUID,
  "decided_at"       TIMESTAMP(3),
  "appeal_of_id"     UUID,
  "rescope_triggered" BOOLEAN      NOT NULL DEFAULT false,
  "created_by"       UUID          NOT NULL,
  "updated_by"       UUID,
  "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "owner_approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "owner_approval_requests_ws_idem"
  ON "owner_approval_requests" ("workspace_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "oar_ws_status_idx"  ON "owner_approval_requests" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "oar_ws_biz_idx"     ON "owner_approval_requests" ("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "oar_ws_action_idx"  ON "owner_approval_requests" ("workspace_id", "action_id");

-- Evidence is append-only; linked to its approval request.
CREATE TABLE IF NOT EXISTS "owner_approval_evidences" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"     UUID          NOT NULL,
  "approval_id"      UUID          NOT NULL,
  "evidence_type"    TEXT          NOT NULL,
  "description"      TEXT          NOT NULL,
  "source_url"       TEXT,
  "credibility_score" DOUBLE PRECISION,
  "submitted_by"     UUID          NOT NULL,
  "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "owner_approval_evidences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oae_approval_fk" FOREIGN KEY ("approval_id")
    REFERENCES "owner_approval_requests"("id")
);

CREATE INDEX IF NOT EXISTS "oae_ws_approval_idx" ON "owner_approval_evidences" ("workspace_id", "approval_id");

-- ─── Bundle 3.8 — Owner Onboarding and Archetype Seeding ─────────────────────

CREATE TABLE IF NOT EXISTS "owner_onboarding" (
  "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        UUID          NOT NULL,
  "business_id"         UUID          NOT NULL,
  "owner_id"            UUID          NOT NULL,
  "status"              TEXT          NOT NULL DEFAULT 'IN_PROGRESS',
  "business_name"       TEXT          NOT NULL,
  "business_type"       TEXT          NOT NULL,
  "revenue_range"       TEXT          NOT NULL,
  "revenue_trend"       TEXT          NOT NULL,
  "cash_runway_weeks"   INTEGER,
  "profitability"       TEXT          NOT NULL,
  "owner_hours_per_week" INTEGER,
  "team_size"           INTEGER,
  "archetype"           TEXT,
  "archetype_score"     DOUBLE PRECISION,
  "initial_action_queue" JSONB,
  "completion_key"      TEXT,
  "completed_at"        TIMESTAMP(3),
  "re_onboarding_reason" TEXT,
  "created_by"          UUID          NOT NULL,
  "updated_by"          UUID,
  "created_at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "owner_onboarding_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "owner_onboarding_workspace_key" UNIQUE ("workspace_id")
);

CREATE INDEX IF NOT EXISTS "oo_ws_status_idx" ON "owner_onboarding" ("workspace_id", "status");

-- ─── Bundle 3.9 — SOP Process Intelligence ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "owner_sop_training_assignments" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    UUID          NOT NULL,
  "sop_document_id" UUID          NOT NULL,
  "assigned_to"     UUID          NOT NULL,
  "assigned_by"     UUID          NOT NULL,
  "due_date"        TIMESTAMP(3),
  "status"          TEXT          NOT NULL DEFAULT 'ASSIGNED',
  "completed_at"    TIMESTAMP(3),
  "evidence_url"    TEXT,
  "evidence_note"   TEXT,
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "owner_sop_training_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sop_training_ws_sop_staff"
  ON "owner_sop_training_assignments" ("workspace_id", "sop_document_id", "assigned_to");

CREATE INDEX IF NOT EXISTS "osta_ws_sop_idx"    ON "owner_sop_training_assignments" ("workspace_id", "sop_document_id");
CREATE INDEX IF NOT EXISTS "osta_ws_status_idx" ON "owner_sop_training_assignments" ("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "owner_sop_noncompliance_alerts" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    UUID          NOT NULL,
  "sop_document_id" UUID          NOT NULL,
  "alert_window"    TEXT          NOT NULL,
  "compliance_rate" DOUBLE PRECISION NOT NULL,
  "threshold"       DOUBLE PRECISION NOT NULL,
  "acknowledged"    BOOLEAN       NOT NULL DEFAULT false,
  "acknowledged_at" TIMESTAMP(3),
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "owner_sop_noncompliance_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sop_noncompliance_ws_sop_window"
  ON "owner_sop_noncompliance_alerts" ("workspace_id", "sop_document_id", "alert_window");

CREATE INDEX IF NOT EXISTS "osna_ws_ack_idx" ON "owner_sop_noncompliance_alerts" ("workspace_id", "acknowledged");
