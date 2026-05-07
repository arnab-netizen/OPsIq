-- Create OperatorAdherenceProfile table for Phase 2 Slice 11
-- Tracks operator adherence using observable operational signals

CREATE TABLE "operator_adherence_profiles" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "total_recommendations" INTEGER NOT NULL DEFAULT 0,
    "recommendations_accepted" INTEGER NOT NULL DEFAULT 0,
    "recommendations_acted_on" INTEGER NOT NULL DEFAULT 0,
    "actions_started" INTEGER NOT NULL DEFAULT 0,
    "actions_completed" INTEGER NOT NULL DEFAULT 0,
    "actions_verified" INTEGER NOT NULL DEFAULT 0,
    "milestones_reached" INTEGER NOT NULL DEFAULT 0,
    "deadlines_met" INTEGER NOT NULL DEFAULT 0,
    "deadlines_missed" INTEGER NOT NULL DEFAULT 0,
    "acceptance_rate" DOUBLE PRECISION,
    "completion_rate" DOUBLE PRECISION,
    "on_time_rate" DOUBLE PRECISION,
    "adherence_score" DOUBLE PRECISION,
    "adherence_status" TEXT NOT NULL DEFAULT 'new',
    "last_signal_at" TIMESTAMP(3),
    "last_signal_type" TEXT,
    "review_notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_adherence_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE CASCADE,
    CONSTRAINT "operator_adherence_profiles_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users" ("id")
);

-- Create indexes for performance
CREATE INDEX "operator_adherence_profiles_engagement_id_idx" ON "operator_adherence_profiles"("engagement_id");
CREATE INDEX "operator_adherence_profiles_operator_id_idx" ON "operator_adherence_profiles"("operator_id");
CREATE INDEX "operator_adherence_profiles_adherence_status_idx" ON "operator_adherence_profiles"("adherence_status");
