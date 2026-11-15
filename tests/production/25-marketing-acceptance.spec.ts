/**
 * LIVE PRODUCTION acceptance -- Marketing Owner journey.
 *
 * Part of the full-domain-acceptance expansion. Investigation confirmed
 * Marketing is a real, distinct diagnosis/action/verification surface
 * (OwnerMarketingSnapshot/Cycle/Finding/Action/Verification) with a
 * nav-reachable owner-facing page, real snapshot intake, deterministic
 * diagnosis (marketingState: COMPOUNDING/GROWING/FLAT/LEAKING/WASTING),
 * finding->action generation, and a full gated action lifecycle. Marketing
 * is GROWTH_SENSITIVE under owner-action-gate.service.ts, same tier as
 * Sales/Operations/Strategy.
 *
 * Unlike Cashflow (which still lacks it -- tracked separately, not fixed
 * here), Marketing's action.service.ts and verification.service.ts DO
 * trigger automatic re-diagnosis on action completion and on verified
 * success (fixed in a prior PR). This mirrors Finance/Sales/Operations/
 * Strategy exactly. Because completing this suite's action deterministically
 * creates a NEW OwnerMarketingCycle, 25-06 captures the target action's own
 * id BEFORE any mutation and verifies Complete/Verify against that exact id
 * (not a `.first()`-by-priority card), matching the established convention
 * from 21-sales-acceptance.spec.ts.
 *
 * This file never sends a mutating request (POST/PATCH) carrying
 * trinityBusinessId -- Trinity Services is read-only, verifiable by reading
 * this file. It uses its OWN dedicated acceptance business (created via
 * helpers/domain-business.ts, never Startup's handoff business or another
 * domain's business) for every mutating step -- see that helper's header
 * for why sharing one business across domains is unsafe. Independently
 * isolated from every other domain spec file -- a Marketing failure here
 * can never suppress any other domain's tests, and vice versa.
 *
 * Out of scope: the separate Marketing Campaigns CRUD sub-page
 * (/owner/marketing/campaigns, OwnerMarketingCampaign) is an unrelated
 * feature, not part of the snapshot/diagnosis/action closed loop this
 * spec covers.
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
  cycleOrdinal,
  driveFixtureActionLifecycle,
} from "./helpers/fixture-domain-loop";

const SPEC_NAME = "phase25-marketing";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-25 — Marketing Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
  let fx: FixtureBusinessTarget;
  let snapshotId = "";
  let lastCycleOrdinal = 0;
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

    // Marketing gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "marketing");
      // Created-and-hidden is not enough: bind the id so every mutation can only target THIS fixture.
      fx = await bindFixtureTarget(context, page, "marketing", acceptanceBusinessId);
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Marketing's dedicated acceptance business: ${
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

    test("25-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
      await page.goto("/owner/marketing", { waitUntil: "networkidle" });
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

    test("25-02 — Marketing dashboard shows a real, non-placeholder recommendation for Trinity if data exists (read-only, output-quality graded)", async () => {
      test.skip(!trinityFound, "Trinity not found (see 25-01)");
      const res = await timedApiCall(context, "GET", "/api/owner/marketing/dashboard", () =>
        page.request.get(`/api/owner/marketing/dashboard?businessId=${trinityBusinessId}`)
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const rec = body.recommendedNextAction;
      if (!rec) {
        console.log("PROD-25 OUTPUT_QUALITY: Trinity has no recommendedNextAction currently -- not gradeable this run.");
        return;
      }
      expect(rec.title, "SPECIFICITY: recommendation title must be non-empty").toBeTruthy();
      expect(rec.description?.length ?? 0, "ACTIONABILITY: description must be substantive, not a stub").toBeGreaterThan(20);
      expect(typeof rec.priorityScore, "PRIORITIZATION: must carry a numeric priority score").toBe("number");
      expect(typeof rec.expectedImpactScore, "DATA_GROUNDING: must carry a numeric impact score").toBe("number");
      expect(rec.verificationMetric, "VERIFIABILITY: must name how it will be verified").toBeTruthy();
      // READ-ONLY: select Trinity in the page's own business selector (client-side state only) -- the page does not
      // read ?businessId=, so a query parameter would not show Trinity.
      await page.goto("/owner/marketing", { waitUntil: "networkidle" });
      await page.locator('select[name="businessSelector"]').selectOption(trinityBusinessId!);
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-marketing-recommendation");
    });
  }); // end Trinity Services (read-only)

  // ─── Acceptance fixture: full Marketing closed loop (governed API, bound to the verified fixture) ──
  //
  // Production run #17 root cause: the previous version drove the ordinary Marketing UI at
  // /owner/marketing?businessId=<fixture>. The page ignores that parameter and takes its business from the
  // fixture-free owner list, so every UI save/diagnosis hit an ORDINARY business. Every mutation below goes through
  // fixture-domain-loop.ts, which is refused unless it targets the bound fixture (or one of its own actions). The UI
  // is read-only here.
  test.describe("Marketing closed loop (acceptance fixture)", () => {
    test.describe.configure({ mode: "serial" });

    test("25-03 — the fixture is addressable by its own id and is NOT offered by the ordinary Marketing UI (positive isolation)", async () => {
      await assertFixtureNotOnOwnerDashboard(context, page, fx);
      // Hidden from ordinary owners: the page's own selector must not list it.
      await page.goto("/owner/marketing", { waitUntil: "networkidle" });
      const select = page.locator('select[name="businessSelector"]');
      if ((await select.count()) > 0) {
        const values = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
        expect(values, "a hidden fixture must never appear in the ordinary owner business selector").not.toContain(acceptanceBusinessId);
      }
    });

    test("25-04 — governed API: save a marketing snapshot with deliberately stressed synthetic inputs on the fixture", async () => {
      // Deliberately stressed inputs -- heavy paid spend against thin revenue and weak follow-up. Synthetic data on the bound fixture only.
      const saved = await saveFixtureSnapshot(context, page, fx, {
        marketingSpend: 100000,
        revenue: 30000,
        leads: 200,
        inquiries: 150,
        orders: 4,
        newCustomers: 4,
        paidLeads: 180,
        organicLeads: 20,
        campaignsRun: 10,
        campaignsWithFollowup: 2,
        contentPosted: 2,
        couponsRedeemed: 1,
        referrals: 0,
        walkIns: 5,
      });
      snapshotId = saved.id;
      expect(fatalErrors()).toHaveLength(0);
    });

    test("25-05 — governed API: run marketing diagnosis on the fixture and see a real result on its own dashboard", async () => {
      const cycle = await runFixtureDiagnosis(context, page, fx, snapshotId);
      const stored = await readFixtureCycle(context, page, fx, String(cycle.id));
      expect(stored.id, "the fixture's own cycle must read back by its id").toBe(cycle.id);
      lastCycleOrdinal = cycleOrdinal(fx, cycle);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("25-06 — action lifecycle on the fixture: Assign -> Start -> Complete -> Verify outcome, each step read back by the action's own id", async () => {
      const outcome = await driveFixtureActionLifecycle(context, page, fx);
      test.skip(outcome.skippedReason !== null, outcome.skippedReason ?? undefined);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("25-07 — reassessment: completing the action above already triggered a second cycle in the fixture's history", async () => {
      // Marketing's action service re-runs diagnosis automatically on completion; assert that effect directly rather
      // than assuming it. Cycle ids of an automatic reassessment are not returned to the caller and a fixture has no
      // dashboard, so the effect is read through the cycle ORDINAL: one manual probe diagnosis takes exactly the next
      // ordinal unless an automatic cycle landed in between, so >= last + 2 proves the automatic reassessment fired.
      const probe = await runFixtureDiagnosis(context, page, fx, snapshotId);
      expect(
        cycleOrdinal(fx, probe),
        "completing the action should have auto-triggered a new cycle via the reassessment mechanism"
      ).toBeGreaterThanOrEqual(lastCycleOrdinal + 2);
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Marketing closed loop (acceptance fixture)

  // ─── Cross-cutting reporting: always runs, regardless of which section
  // above failed -- deliberately outside either serial block. ──

  test("25-08 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
    expect(fx?.serverErrors ?? []).toEqual([]);
  });

  test("25-09 — record findings for the acceptance report", () => {
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
