-- Google Search Console integration scaffold (code-only; no live credentials exist yet).
-- ADDITIVE ONLY: one new, empty table. Not referenced by any FK and references none, so no
-- existing row can be affected and there is nothing to de-duplicate or backfill.
--
-- Not workspace-scoped: tracks OpsIQ's own sc-domain:opsiq.solutions property (a single,
-- internal property), not a per-tenant customer connector like owner_connectors.
--
-- "row_key" is a deterministic sha256 hex digest of (site_url, date, query, page, device,
-- country), computed in src/services/external-systems/search-console-ingestion.service.ts.
-- The ingestion script upserts on this key so re-running it for a day it already has never
-- creates a duplicate row — and also lets it in-place-correct a day's numbers if GSC revises
-- them within its ~2-3 day reporting-delay window, which is intentional.

-- CreateTable
CREATE TABLE "search_console_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_url" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "query" TEXT NOT NULL DEFAULT '',
    "page" TEXT NOT NULL DEFAULT '',
    "device" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "row_key" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_console_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_console_metrics_row_key_key" ON "search_console_metrics"("row_key");

-- CreateIndex
CREATE INDEX "search_console_metrics_site_url_date_idx" ON "search_console_metrics"("site_url", "date");
