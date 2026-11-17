/**
 * Google Search Console — idempotent daily ingestion.
 *
 * Calls src/lib/integrations/search-console.ts's searchAnalyticsQuery() for one report date and
 * upserts each resulting row into SearchConsoleMetric, keyed by a deterministic hash of
 * (siteUrl, date, query, page, device, country) — see computeSearchConsoleRowKey(). Re-running
 * this for a date it has already ingested therefore UPDATES those rows in place instead of
 * duplicating them (satisfying "don't duplicate a day's data on re-run"), and also lets it pick
 * up Google's own revisions to a day's numbers, which can happen for a few days after that day
 * is first reported (GSC's reporting delay — see computeDataFreshness() in the client).
 *
 * This module does NOT schedule itself. It is called by scripts/ingest-search-console.ts, a
 * manual (workflow_dispatch-only, not yet wired to any cron/schedule) entry point — see that
 * script's header and docs/opsiq/product/GSC_INTEGRATION_SETUP.md for why.
 */
import { db } from "@/lib/db";
import {
  searchAnalyticsQuery,
  computeSearchConsoleRowKey,
  type SearchConsoleAuth,
  type SearchAnalyticsDimension,
  type DataFreshness,
  type FetchLike,
} from "@/lib/integrations/search-console";

/** The scaffold's default breakdown — matches the task's ask (query/page/device/country). */
export const DEFAULT_INGESTION_DIMENSIONS: SearchAnalyticsDimension[] = [
  "query",
  "page",
  "device",
  "country",
];

export interface IngestSearchConsoleDayInput {
  /** e.g. "sc-domain:opsiq.solutions" */
  siteUrl: string;
  /** "YYYY-MM-DD" — the single report date to ingest. */
  date: string;
  auth: SearchConsoleAuth;
  dimensions?: SearchAnalyticsDimension[];
  rowLimit?: number;
  fetchImpl?: FetchLike;
}

export interface IngestSearchConsoleDayResult {
  siteUrl: string;
  date: string;
  rowsFetched: number;
  /** Count of upserts performed (creates + updates) — NOT necessarily === rowsFetched minus
   * skips, because nothing is ever skipped here: every fetched row is upserted. */
  rowsWritten: number;
  possiblyIncomplete: boolean;
  freshness: DataFreshness;
}

interface DimensionValues {
  query: string;
  page: string;
  device: string;
  country: string;
}

/** Maps a row's positional `keys` array back to named dimension values, in the same order the
 * dimensions were requested in. The "date" dimension is intentionally never stored per-row —
 * ingestSearchConsoleDay() always queries a single day, so the day itself is the `date` column. */
function extractDimensionValues(
  dimensions: SearchAnalyticsDimension[],
  keys: string[] | undefined,
): DimensionValues {
  const out: DimensionValues = { query: "", page: "", device: "", country: "" };
  dimensions.forEach((dim, i) => {
    if (dim === "date") return;
    const value = keys?.[i] ?? "";
    if (dim === "query" || dim === "page" || dim === "device" || dim === "country") {
      out[dim] = value;
    }
  });
  return out;
}

export async function ingestSearchConsoleDay(
  input: IngestSearchConsoleDayInput,
): Promise<IngestSearchConsoleDayResult> {
  const dimensions = input.dimensions ?? DEFAULT_INGESTION_DIMENSIONS;

  const result = await searchAnalyticsQuery({
    siteUrl: input.siteUrl,
    startDate: input.date,
    endDate: input.date,
    dimensions,
    rowLimit: input.rowLimit,
    auth: input.auth,
    fetchImpl: input.fetchImpl,
  });

  const reportDate = new Date(`${input.date}T00:00:00.000Z`);
  let rowsWritten = 0;

  for (const row of result.rows) {
    const dims = extractDimensionValues(dimensions, row.keys);
    const rowKey = computeSearchConsoleRowKey({ siteUrl: input.siteUrl, date: input.date, ...dims });

    await db.searchConsoleMetric.upsert({
      where: { rowKey },
      create: {
        siteUrl: input.siteUrl,
        date: reportDate,
        query: dims.query,
        page: dims.page,
        device: dims.device,
        country: dims.country,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        rowKey,
      },
      update: {
        // Re-ingesting the same day in-place-corrects the metrics GSC reports for it, and bumps
        // fetchedAt so it's visible that this row was refreshed, not newly created.
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        fetchedAt: new Date(),
      },
    });
    rowsWritten++;
  }

  return {
    siteUrl: input.siteUrl,
    date: input.date,
    rowsFetched: result.rows.length,
    rowsWritten,
    possiblyIncomplete: result.possiblyIncomplete,
    freshness: result.freshness,
  };
}
