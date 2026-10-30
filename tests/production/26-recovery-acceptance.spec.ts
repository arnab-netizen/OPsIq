/**
 * LIVE PRODUCTION acceptance -- Recovery Owner journey.
 *
 * Part of the full-domain-acceptance expansion. A dedicated investigation
 * confirmed Recovery is a real, distinct domain -- its own Prisma model set
 * (RecoveryCycle/RecoveryFinding/RecoveryAction/RecoveryVerification, keyed
 * off OwnerMetricSnapshot rather than a Recovery-prefixed snapshot model),
 * its own status machine (domain/founder-recovery/action-status.ts), and a
 * nav-reachable owner-facing page (/owner/recovery, linked from owner/
 * page.tsx and owner/home/page.tsx since PR #256 -- the historical
 * navigation gap this expansion's task list referenced no longer exists on
 * current main; confirmed from source, not assumed).
 *
 * Recovery's page diverges structurally from Marketing/Sales/Operations/
 * Strategy/Cashflow in ways this spec follows deliberately rather than
 * copying their pattern blindly:
 * - Snapshot fields match MetricSnapshotZodInput (revenue/totalCosts/
 *   orderCount/repeatCustomers/deliveryCost/etc, not a domain-specific
 *   schema) -- button text is "+ Add metric snapshot", not "+ Add recovery
 *   snapshot".
 * - Diagnosis is "Run diagnosis cycle" against POST .../cycles (not
 *   .../diagnoses), and the actions section renders as "Recovery actions".
 * - Completion prompts for "Completion notes:" and "Actual outcome:" (not
 *   "Completion evidence:") -- helpers/dialog-handler.ts was extended with
 *   an "Actual outcome" case for this, confirmed necessary from source.
 * - Verification takes only `afterValue` (baseline/target/direction are
 *   already stored on the action from cycle generation, unlike Sales/
 *   Cashflow's `{beforeValue, afterValue, targetDirection}` shape) -- this
 *   spec computes an afterValue from the action's own baselineValue/
 *   targetValue/direction so it deterministically reaches target
 *   regardless of which finding produced the first action, rather than
 *   hardcoding a value tied to one specific metric.
 *
 * IMPORTANT, deliberately NOT asserted here: a dedicated investigation
 * found founder-recovery's action/verification services do NOT (yet)
 * trigger automatic re-diagnosis on completion or verified success, unlike
 * every other owner-domain action service. A fix (mirroring Cashflow's
 * PR #341) is tracked and implemented separately in PR #344 -- once merged,
 * a follow-up to this spec will add the reassessment assertion, the same
 * two-step sequence Cashflow itself went through (spec first, reassessment
 * assertion added once its own fix landed). 26-06 verifies Complete/Verify
 * by the action's own exact id anyway (not a `.first()` card), which is
 * strictly more robust regardless of whether reassessment exists yet, and
 * makes this test forward-compatible with PR #344 without needing to be
 * rewritten.
 *
 * This file never sends a mutating request (POST/PATCH) carrying
 * trinityBusinessId. It uses its OWN dedicated acceptance business (created
 * via helpers/domain-business.ts, never Startup's handoff business or
 * another domain's business) for every mutating step. Independently
 * isolated from every other domain spec file -- a Recovery failure here can
 * never suppress any other domain's tests, and vice versa.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { newSharedAuthenticatedContext } from "./helpers/shared-auth";
import {
  startEvidenceCollection,
  captureOnFailure,
  checkpointScreenshot,
  finalizeEvidence,
  timedApiCall,
} from "./helpers/evidence";
import { registerActionDialogHandler } from "./helpers/dialog-handler";
import { createJourneyWatch } from "./helpers/journey-watchers";
import { resolveOrCreateDomainBusiness } from "./helpers/domain-business";
import { bindFixtureTarget, type FixtureBusinessTarget } from "./helpers/fixture-target";
import {
  saveFixtureSnapshot,
  runFixtureDiagnosis,
  assertFixtureNotOnOwnerDashboard,
  readFixtureCycle,
  driveFixtureActionLifecycle,
} from "./helpers/fixture-domain-loop";

const SPEC_NAME = "phase26-recovery";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-26 — Recovery Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
  let fx: FixtureBusinessTarget;
  let snapshotId = "";
  let trinityBusinessId: string | null = null;
  let trinityFound = false;
  // Non-null only when this suite must not proceed -- distinguishes a real
  // setup failure (auth, or this domain's own dedicated business could not
  // be created) from this suite's own test defects.
  let blockedUpstreamReason: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // One login for the whole run (global-setup); this spec never logs in again. See helpers/shared-auth.ts.
    ({ context, page } = await newSharedAuthenticatedContext(browser));
    watchPage(page);
    registerActionDialogHandler(page);
    await startEvidenceCollection(context, page, SPEC_NAME);

    // Recovery gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "recovery");
      // Created-and-hidden is not enough: bind the id so every mutation can only target THIS fixture.
      fx = await bindFixtureTarget(context, page, "recovery", acceptanceBusinessId);
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Recovery's dedicated acceptance business: ${
        e instanceof Error ? e.message : String(e)
      }`;
    }
  });

  test.beforeEach(() => {
    test.skip(blockedUpstreamReason !== null, blockedUpstreamReason ?? undefined);
  });

  test.afterEach(async ({}, testInfo) => {
    await captureOnFailure(context, page, testInfo, SPEC_NAME);
  });

  test.afterAll(async () => {
    await finalizeEvidence(context, SPEC_NAME);
    if (context) await context.close();
  });

  // ─── Trinity Services: read-only discovery + output-quality visibility ──
  test.describe("Trinity Services (read-only)", () => {
    test.describe.configure({ mode: "serial" });

    test("26-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
      await page.goto("/owner/recovery", { waitUntil: "networkidle" });
      const select = page.locator('select[name="businessSelector"]');
      if ((await select.count()) === 0) {
        test.skip(true, "No business selector rendered -- acceptance account has zero visible businesses.");
        return;
      }
      const options = await select.locator("option").all();
      for (const opt of options) {
        const label = (await opt.textContent()) ?? "";
        if (/trinity/i.test(label)) {
          trinityBusinessId = await opt.getAttribute("value");
          trinityFound = true;
          break;
        }
      }
      if (!trinityFound) {
        test.skip(
          true,
          "No business matching 'Trinity' visible to the acceptance account -- Trinity-specific read-only steps skipped, not faked as passing."
        );
      }
      expect(trinityFound).toBe(true);
    });

    test("26-02 — Recovery dashboard reflects Trinity's real data if a cycle exists (read-only)", async () => {
      test.skip(!trinityFound, "Trinity not found (see 26-01)");
      const res = await timedApiCall(context, "GET", "/api/owner/recovery/dashboard", () =>
        page.request.get(`/api/owner/recovery/dashboard?businessId=${trinityBusinessId}`)
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      if (!body.hasData) {
        console.log("PROD-26 OUTPUT_QUALITY: Trinity has no Recovery cycle yet -- not gradeable this run.");
        return;
      }
      expect(typeof body.latestCycle.healthScore, "must carry a numeric health score").toBe("number");
      expect(body.latestCycle.summary?.length ?? 0, "cycle summary must be substantive, not a stub").toBeGreaterThan(10);
      // READ-ONLY: select Trinity in the page's own business selector (client-side state only) -- the page does not
      // read ?businessId=, so a query parameter would not show Trinity.
      await page.goto("/owner/recovery", { waitUntil: "networkidle" });
      await page.locator('select[name="businessSelector"]').selectOption(trinityBusinessId!);
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-recovery-cycle");
    });
  }); // end Trinity Services (read-only)

  // ─── Acceptance fixture: full Recovery closed loop (governed API, bound to the verified fixture) ──
  //
  // Production run #17 root cause: the previous version drove the ordinary Recovery UI at
  // /owner/recovery?businessId=<fixture>. The page ignores that parameter and takes its business from the
  // fixture-free owner list, so every UI save/diagnosis hit an ORDINARY business. Every mutation below goes through
  // fixture-domain-loop.ts, which is refused unless it targets the bound fixture (or one of its own actions). The UI
  // is read-only here.
  test.describe("Recovery closed loop (acceptance fixture)", () => {
    test.describe.configure({ mode: "serial" });

    test("26-03 — the fixture is addressable by its own id and is NOT offered by the ordinary Recovery UI (positive isolation)", async () => {
      await assertFixtureNotOnOwnerDashboard(context, page, fx);
      // Hidden from ordinary owners: the page's own selector must not list it.
      await page.goto("/owner/recovery", { waitUntil: "networkidle" });
      const select = page.locator('select[name="businessSelector"]');
      if ((await select.count()) > 0) {
        const values = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
        expect(values, "a hidden fixture must never appear in the ordinary owner business selector").not.toContain(acceptanceBusinessId);
      }
    });

    test("26-04 — governed API: save a metric snapshot with deliberately stressed synthetic inputs on the fixture", async () => {
      // Deliberately stressed inputs -- weak repeat-customer rate (30%, below the WEAK_REPEAT_RATE threshold) and high delivery-cost leakage (12% of revenue). Synthetic data on the bound fixture only.
      const saved = await saveFixtureSnapshot(context, page, fx, {
        revenue: 100000,
        totalCosts: 95000,
        orderCount: 1000,
        newCustomers: 70,
        repeatCustomers: 30,
        deliveryCost: 12000,
      });
      snapshotId = saved.id;
      expect(fatalErrors()).toHaveLength(0);
    });

    test("26-05 — governed API: run a diagnosis cycle on the fixture and see a real result on its own dashboard", async () => {
      const cycle = await runFixtureDiagnosis(context, page, fx, snapshotId);
      const stored = await readFixtureCycle(context, page, fx, String(cycle.id));
      expect(stored.id, "the fixture's own cycle must read back by its id").toBe(cycle.id);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("26-06 — action lifecycle on the fixture: Assign -> Start -> Complete -> Verify outcome, each step read back by the action's own id", async () => {
      const outcome = await driveFixtureActionLifecycle(context, page, fx);
      test.skip(outcome.skippedReason !== null, outcome.skippedReason ?? undefined);
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Recovery closed loop (acceptance fixture)

  // ─── Cross-cutting reporting: always runs, regardless of which section
  // above failed -- deliberately outside either serial block. ──

  test("26-07 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
    expect(fx?.serverErrors ?? []).toEqual([]);
  });

  test("26-08 — record findings for the acceptance report", () => {
    writeFileSync(
      `production-test-results/evidence/${SPEC_NAME}-summary.json`,
      JSON.stringify(
        {
          acceptanceBusinessId,
          trinityBusinessId,
          trinityFound,
          fatalConsoleErrors: fatalErrors(),
          serverErrors: networkFailures,
        },
        null,
        2
      )
    );
  });
});
