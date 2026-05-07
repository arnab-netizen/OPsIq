-- Create LocalMarketProfile table for Phase 2
-- Captures geographic, competitive, and regulatory market constraints
CREATE TABLE "local_market_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "engagement_id" UUID NOT NULL UNIQUE,
  "primary_geography" VARCHAR(255),
  "secondary_geographies" TEXT,
  "market_size_millions" INTEGER,
  "market_growth_percentage" FLOAT,
  "market_share" FLOAT,
  "competitor_count" INTEGER,
  "competitiveness" VARCHAR(255) NOT NULL DEFAULT 'moderate',
  "barriers_to_entry" TEXT,
  "customer_concentration_geographic" FLOAT,
  "price_compression" BOOLEAN NOT NULL DEFAULT false,
  "price_compression_rate" FLOAT,
  "demand_trend" VARCHAR(255),
  "regulatory_environment" VARCHAR(255) NOT NULL DEFAULT 'stable',
  "regulatory_risks" TEXT,
  "compliance_burden" VARCHAR(255) NOT NULL DEFAULT 'moderate',
  "labor_market_tightness" VARCHAR(255),
  "supply_chain_vulnerabilities" TEXT,
  "tax_environment_rating" INTEGER,
  "skills_availability" VARCHAR(255),
  "assessed_by" UUID,
  "assessed_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "local_market_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "local_market_profiles_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "local_market_profiles_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "local_market_profiles_engagement_id_idx" ON "local_market_profiles"("engagement_id");
