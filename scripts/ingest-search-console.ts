#!/usr/bin/env node
/**
 * Google Search Console — manual daily ingestion entry point.
 *
 * NOT wired to any schedule/cron yet — see docs/opsiq/product/GSC_INTEGRATION_SETUP.md. Run by
 * hand (`npm run gsc:ingest -- --date=2026-11-14`) once the owner has completed the manual GCP
 * setup documented there and a real credential exists in the environment. Until then this
 * fails fast and loudly from getSearchConsoleAuthFromEnv() with a clear "no credential
 * configured" error; it never silently no-ops or reports success without actually ingesting.
 *
 * Wiring this into a scheduled workflow (e.g. a new .github/workflows/*.yml with a `schedule:`
 * trigger) is an explicit follow-up, deliberately out of scope here.
 *
 * Usage:
 *   npm run gsc:ingest                      # defaults to GSC_REPORTING_DELAY_DAYS_MAX days ago
 *   npm run gsc:ingest -- --date=2026-11-14 # a specific report date (YYYY-MM-DD)
 *
 * Env:
 *   GSC_SITE_URL                      defaults to "sc-domain:opsiq.solutions"
 *   GSC_ACCESS_TOKEN                  WIF/CI path — see the setup doc, Option B
 *   GSC_SERVICE_ACCOUNT_KEY_JSON      simple path — raw JSON, see the setup doc, Option A
 *   GSC_SERVICE_ACCOUNT_KEY_BASE64    simple path — base64-encoded JSON (easier to store as a
 *                                     single-line secret in some CI systems)
 */
import {
  getSearchConsoleAuthFromEnv,
  GSC_REPORTING_DELAY_DAYS_MAX,
} from "@/lib/integrations/search-console";
import { ingestSearchConsoleDay } from "@/services/external-systems/search-console-ingestion.service";

const DEFAULT_SITE_URL = "sc-domain:opsiq.solutions";

function parseArgDate(argv: string[], now: Date = new Date()): string {
  const arg = argv.find((a) => a.startsWith("--date="));
  if (arg) return arg.slice("--date=".length);

  // Conservative default: always inside GSC's own reporting-delay window, so a bare run never
  // silently asks for a date Google is unlikely to have finished aggregating yet.
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - GSC_REPORTING_DELAY_DAYS_MAX);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const siteUrl = process.env.GSC_SITE_URL ?? DEFAULT_SITE_URL;
  const date = parseArgDate(process.argv.slice(2));
  const auth = getSearchConsoleAuthFromEnv();

  console.log(`[gsc-ingest] siteUrl=${siteUrl} date=${date}`);

  const result = await ingestSearchConsoleDay({ siteUrl, date, auth });

  console.log(
    `[gsc-ingest] rowsFetched=${result.rowsFetched} rowsWritten=${result.rowsWritten} ` +
      `possiblyIncomplete=${result.possiblyIncomplete}`,
  );
  console.log(`[gsc-ingest] freshness: ${result.freshness.note}`);

  if (result.freshness.withinReportingDelayWindow) {
    console.warn(
      `[gsc-ingest] WARNING: ${date} is inside Google's reporting-delay window — data for it may ` +
        `still be incomplete and may change if this script is re-run for the same date later.`,
    );
  }
}

main().catch((error) => {
  console.error("[gsc-ingest] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
