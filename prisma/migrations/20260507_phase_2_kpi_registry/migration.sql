-- Create KPIRegistry table for Phase 2 Slice 8
-- Captures canonical KPI formula definitions

CREATE TABLE "kpi_registries" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "formula_name" TEXT NOT NULL,
    "formula_type" TEXT NOT NULL,
    "description" TEXT,
    "canonical_definition" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "input_parameters" TEXT,
    "standard_threshold" TEXT,
    "workspace_id" UUID,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_registries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX "kpi_registries_formula_type_idx" ON "kpi_registries"("formula_type");
CREATE INDEX "kpi_registries_is_global_idx" ON "kpi_registries"("is_global");
CREATE INDEX "kpi_registries_workspace_id_idx" ON "kpi_registries"("workspace_id");
