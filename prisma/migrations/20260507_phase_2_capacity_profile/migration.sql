CREATE TABLE "capacity_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "engagement_id" UUID NOT NULL UNIQUE,
  "total_team_size" INTEGER,
  "key_person_count" INTEGER,
  "average_experience_years" FLOAT,
  "turnover_rate_annual" FLOAT,
  "managerial_capacity_level" VARCHAR(255),
  "training_capacity_level" VARCHAR(255),
  "systems_available_capacity" INTEGER,
  "infrastructure_age_years" INTEGER,
  "hardware_refresh_cycle_months" INTEGER,
  "cloud_vs_on_premise_percentage" FLOAT,
  "uptime_99_count" INTEGER,
  "data_center_redundancy_level" VARCHAR(255),
  "api_rate_limit_headroom" FLOAT,
  "security_compliance_gaps" INTEGER,
  "capability_gaps_identified" INTEGER,
  "project_capacity_utilization" FLOAT,
  "overall_capacity_status" VARCHAR(255) NOT NULL DEFAULT 'adequate',
  "critical_capacity_bottleneck" TEXT,
  "assessed_by" UUID,
  "assessed_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "capacity_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "capacity_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "capacity_profiles_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "capacity_profiles_engagement_id_idx" ON "capacity_profiles"("engagement_id");
