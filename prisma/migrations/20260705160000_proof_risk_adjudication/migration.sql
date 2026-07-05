-- Owner proof-risk adjudication depth pass — governed owner/reviewer decision about a flagged
-- proof-risk finding (reused-hash / fake-suspicious anti-gaming / reused-proof credibility / dispute).
--
-- Additive, backfill-safe, non-destructive: a brand-new table (no change to existing tables). It records
-- the decision fairly + auditably; it never accuses fraud/theft, holds a hidden score, deletes evidence,
-- or rewrites proof status. The UNIQUE (workspace_id, idempotency_key) makes repeated submission idempotent.

CREATE TABLE "proof_risk_adjudications" (
  "id"                       UUID NOT NULL,
  "workspace_id"             UUID NOT NULL,
  "idempotency_key"          TEXT NOT NULL,
  "source_type"              TEXT NOT NULL,
  "source_ref"               TEXT NOT NULL,
  "proof_ids"                UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "actor_ids"                UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "adjudicated_by_user_id"   UUID,
  "adjudicated_by_role"      TEXT,
  "outcome"                  TEXT NOT NULL,
  "reason"                   TEXT NOT NULL,
  "owner_action_required"    BOOLEAN NOT NULL DEFAULT false,
  "recommended_next_action"  TEXT NOT NULL,
  "status"                   TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proof_risk_adjudications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "proof_risk_adjudications_workspace_id_idempotency_key_key" ON "proof_risk_adjudications"("workspace_id", "idempotency_key");
CREATE INDEX "proof_risk_adjudications_workspace_id_source_type_idx" ON "proof_risk_adjudications"("workspace_id", "source_type");
