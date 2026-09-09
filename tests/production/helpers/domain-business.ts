/**
 * Resolves -- creating once per live run if needed -- a dedicated synthetic
 * acceptance business for ONE owner domain's mutating tests.
 *
 * Root cause this exists to fix: every domain's action-lifecycle test
 * previously reused the SAME shared acceptance business (the one Startup
 * Mode's own onboarding flow hands off via phase13-startup-mode-ids.json).
 * enforceOwnerActionGates() reads that business's LATEST OwnerFinanceCycle/
 * OwnerCashflowCycle state regardless of which domain's diagnosis created
 * it -- so one domain's own valid, intentional AT_RISK/INSOLVENT_RISK state
 * silently blocked a DIFFERENT domain's action-lifecycle test. Confirmed
 * empirically against real Postgres before writing this fix (see PR #341's
 * description and src/__tests__/deployment/production-acceptance-domain-
 * isolation.test.ts's own hostile-repro test).
 *
 * Each domain gets its OWN dedicated business, created via the real,
 * capability-gated POST /api/owner/recovery/businesses endpoint -- the same
 * createBusiness() service every domain's hostile DB test already uses, not
 * a second, parallel creation path. Startup's own handoff business is left
 * untouched and is never read or reused here.
 *
 * Idempotent within a single run: the created id is cached to a per-domain,
 * per-run evidence file, so a spec file (or a future one reusing this same
 * helper) that resolves the same domain twice in one run never creates a
 * second business for it. A NEW business is created per live run (the name
 * embeds the run id) rather than reused indefinitely across runs, matching
 * how Startup's own handoff business is also created fresh each run.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { BrowserContext, Page } from "@playwright/test";
import { timedApiCall } from "./evidence";

export const MUTATING_DOMAINS = [
  "finance",
  "sales",
  "marketing",
  "operations",
  "strategy",
  "cashflow",
  "recovery",
] as const;
export type MutatingDomain = (typeof MUTATING_DOMAINS)[number];

const EVIDENCE_DIR = "production-test-results/evidence";

interface DomainBusinessRecord {
  domain: MutatingDomain;
  businessId: string;
  name: string;
  runId: string;
}

/** GitHub Actions supplies a unique id per workflow run; local/dev runs fall
 * back to a process-lifetime value so repeated local runs each get their own
 * business rather than silently colliding on a fixed name. Memoized: the
 * local fallback embeds Date.now(), which must stay IDENTICAL across every
 * call within one run for the cache-file idempotency check below to ever
 * match -- recomputing it per call would make every call miss the cache. */
let _cachedRunId: string | undefined;
function currentRunId(): string {
  if (_cachedRunId === undefined) {
    _cachedRunId = process.env.GITHUB_RUN_ID ?? `local-${process.pid}-${Date.now()}`;
  }
  return _cachedRunId;
}

function cacheFilePath(domain: MutatingDomain): string {
  return join(EVIDENCE_DIR, `domain-business-${domain}.json`);
}

function domainDisplayName(domain: MutatingDomain): string {
  return domain[0].toUpperCase() + domain.slice(1);
}

/**
 * Returns this run's dedicated business id for `domain`, creating it via a
 * real API call on first use and reusing the cached id for any later call
 * within the same run (same GITHUB_RUN_ID / same local process).
 */
export async function resolveOrCreateDomainBusiness(
  context: BrowserContext | undefined,
  page: Page,
  domain: MutatingDomain
): Promise<string> {
  const runId = currentRunId();
  const cacheFile = cacheFilePath(domain);

  if (existsSync(cacheFile)) {
    try {
      const cached: DomainBusinessRecord = JSON.parse(readFileSync(cacheFile, "utf-8"));
      if (cached.runId === runId && cached.businessId) return cached.businessId;
    } catch {
      // Corrupt/partial cache file -- fall through and create fresh.
    }
  }

  const name = `OPSIQ Acceptance - ${domainDisplayName(domain)} - ${runId}`;
  const res = await timedApiCall(context, "POST", "/api/owner/recovery/businesses", () =>
    page.request.post("/api/owner/recovery/businesses", {
      data: {
        name,
        businessType: "generic_local_service",
        currency: "INR",
        b2cSupported: true,
        b2bSupported: false,
        // Marks this as synthetic acceptance data at creation time (see
        // OwnerBusiness.isFixtureBusiness), rather than relying on the
        // "OPSIQ Acceptance - ..." name to keep it out of ordinary owners'
        // views. Requires the acceptance account to hold SYSTEM_ADMIN in the
        // target environment -- the route silently ignores this flag
        // otherwise, so it is not sufficient on its own without that grant.
        isFixtureBusiness: true,
      },
    })
  );
  if (!res.ok()) {
    throw new Error(
      `Failed to create dedicated ${domain} acceptance business: HTTP ${res.status()}`
    );
  }
  const body = await res.json();
  const businessId: string = body.id;
  if (!businessId) {
    throw new Error(`Dedicated ${domain} acceptance business creation returned no id.`);
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const record: DomainBusinessRecord = { domain, businessId, name, runId };
  writeFileSync(cacheFile, JSON.stringify(record, null, 2));

  return businessId;
}
