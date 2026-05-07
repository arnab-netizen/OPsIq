-- Create ComplianceFlag table for Phase 2 Slice 7
-- Captures regulatory, operational, and contractual compliance requirements

CREATE TABLE "compliance_flags" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "compliance_name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "remediation_required" BOOLEAN NOT NULL DEFAULT false,
    "remediation_deadline" TIMESTAMP(3),
    "remedial_actions_taken" TEXT,
    "verified_by" UUID,
    "last_verified_at" TIMESTAMP(3),
    "impact_on_operations" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_flags_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE CASCADE,
    CONSTRAINT "compliance_flags_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users" ("id")
);

-- Create indexes for performance
CREATE INDEX "compliance_flags_engagement_id_idx" ON "compliance_flags"("engagement_id");
CREATE INDEX "compliance_flags_status_idx" ON "compliance_flags"("status");
CREATE INDEX "compliance_flags_severity_idx" ON "compliance_flags"("severity");
