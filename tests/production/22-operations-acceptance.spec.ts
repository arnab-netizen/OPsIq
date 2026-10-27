/**
 * LIVE PRODUCTION acceptance -- Operations Owner journey.
 *
 * Part of the full-domain-acceptance expansion. Investigation confirmed
 * Operations has a real, working data->diagnosis->recommendation->action->
 * verification loop: a nav-reachable owner-facing page, real snapshot
 * intake, deterministic diagnosis, finding->action generation, a full
 * action lifecycle, and automatic re-diagnosis on action completion
 * (owner-operations/action.service.ts mirrors owner-finance/action.service.ts's
 * mechanism exactly). Two honest gaps, NOT asserted here: (1) reassessment
 * is event-triggered only (on action completion/verified success), not
 * data-triggered (a new snapshot alone does not auto-run diagnosis) --
 * this matches Finance's own established pattern, not a defect; (2)
 * "learning" (a verified outcome changing a later recommendation) is
 * Finance-only in this codebase -- not claimed or tested here.
 *
 * Applies the run #6 (workflow run #32568877293) forensic lesson
 * proactively: captures the target action's own id before mutation and
 * verifies Complete/Verify against that exact id, not a `.first()` card.
 *
 * This file never sends a mutating request (POST/PATCH) carrying
 * trinityBusinessId. It reuses the ONE dedicated acceptance business
 * created by 10-startup-mode-acceptance.spec.ts, matching this suite's
 * established convention. Independently isolated from every other domain
 * spec file -- an Operations failure here can never suppress Sales,
 * Finance, Strategy, Cashflow, Startup, or vice versa.
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

const SPEC_NAME = "phase22-operations";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-22 — Operations Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
  let fx: FixtureBusinessTarget;
  let snapshotId = "";
  let lastCycleOrdinal = 0;
  let trinityBusinessId: string | null = null;
  let trinityFound = false;
  let blockedUpstreamReason: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // One login for the whole run (global-setup); this spec never logs in again. See helpers/shared-auth.ts.
    ({ context, page } = await newSharedAuthenticatedContext(browser));
    watchPage(page);
    registerActionDialogHandler(page);
    await startEvidenceCollection(context, page, SPEC_NAME);

    // Operations gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "operations");
      // Created-and-hidden is not enough: bind the id so every mutation can only target THIS fixture.
      fx = await bindFixtureTarget(context, page, "operations", acceptanceBusinessId);
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Operations's dedicated acceptance business: ${
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

  test.describe("Trinity Services (read-only)", () => {
    test.describe.configure({ mode: "serial" });

    test("22-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
      await page.goto("/owner/operations", { waitUntil: "networkidle" });
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
        test.skip(true, "No business matching 'Trinity' visible to the acceptance account.");
      }
      expect(trinityFound).toBe(true);
    });

    test("22-02 — Operations dashboard shows a real, non-placeholder recommendation for Trinity if data exists (read-only, output-quality graded)", async () => {
      test.skip(!trinityFound, "Trinity not found (see 22-01)");
      const res = await timedApiCall(context, "GET", "/api/owner/operations/dashboard", () =>
        page.request.get(`/api/owner/operations/dashboard?businessId=${trinityBusinessId}`)
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const rec = body.recommendedNextAction;
      if (!rec) {
        console.log("PROD-22 OUTPUT_QUALITY: Trinity has no recommendedNextAction currently -- not gradeable this run.");
        return;
      }
      expect(rec.title, "SPECIFICITY: recommendation title must be non-empty").toBeTruthy();
      expect(rec.description?.length ?? 0, "ACTIONABILITY: description must be substantive, not a stub").toBeGreaterThan(20);
      expect(typeof rec.priorityScore, "PRIORITIZATION: must carry a numeric priority score").toBe("number");
      expect(typeof rec.expectedImpactScore, "DATA_GROUNDING: must carry a numeric impact score").toBe("number");
      expect(rec.verificationMetric, "VERIFIABILITY: must name how it will be verified").toBeTruthy();
      // READ-ONLY: select Trinity in the page's own business selector (client-side state only) -- the page does not
      // read ?businessId=, so a query parameter would not show Trinity.
      await page.goto("/owner/operations", { waitUntil: "networkidle" });
      await page.locator('select[name="businessSelector"]').selectOption(trinityBusinessId!);
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-operations-recommendation");
    });
  });
  // ─── Acceptance fixture: full Operations closed loop (governed API, bound to the verified fixture) ──
  //
  // Production run #17 root cause: the previous version drove the ordinary Operations UI at
  // /owner/operations?businessId=<fixture>. The page ignores that parameter and takes its business from the
  // fixture-free owner list, so every UI save/diagnosis hit an ORDINARY business. Every mutation below goes through
  // fixture-domain-loop.ts, which is refused unless it targets the bound fixture (or one of its own actions). The UI
  // is read-only here.
  test.describe("Operations closed loop (acceptance fixture)", () => {
    test.describe.configure({ mode: "serial" });

    test("22-03 — the fixture is addressable by its own id and is NOT offered by the ordinary Operations UI (positive isolation)", async () => {
      await assertFixtureNotOnOwnerDashboard(context, page, fx);
      // Hidden from ordinary owners: the page's own selector must not list it.
      await page.goto("/owner/operations", { waitUntil: "networkidle" });
      const select = page.locator('select[name="businessSelector"]');
      if ((await select.count()) > 0) {
        const values = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
        expect(values, "a hidden fixture must never appear in the ordinary owner business selector").not.toContain(acceptanceBusinessId);
      }
    });

    test("22-04 — governed API: save an operations snapshot with deliberately stressed synthetic inputs on the fixture", async () => {
      // Deliberately stressed inputs -- delayed orders, rework, idle capacity, delivery failures and missed SOP checks. Synthetic data on the bound fixture only.
      const saved = await saveFixtureSnapshot(context, page, fx, {
        ordersReceived: 200,
        ordersCompleted: 130,
        ordersDelayed: 70,
        reworkCount: 30,
        complaints: 15,
        staffHours: 500,
        machineCapacityUnits: 150,
        idleHours: 150,
        deliveryAttempts: 100,
        deliveryFailures: 30,
        sopChecks: 100,
        sopMisses: 50,
      });
      snapshotId = saved.id;
      expect(fatalErrors()).toHaveLength(0);
    });

    test("22-05 — governed API: run operations diagnosis on the fixture and see a real result on its own dashboard", async () => {
      const cycle = await runFixtureDiagnosis(context, page, fx, snapshotId);
      const stored = await readFixtureCycle(context, page, fx, String(cycle.id));
      expect(stored.id, "the fixture's own cycle must read back by its id").toBe(cycle.id);
      lastCycleOrdinal = cycleOrdinal(fx, cycle);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("22-06 — action lifecycle on the fixture: Assign -> Start -> Complete -> Verify outcome, each step read back by the action's own id", async () => {
      const outcome = await driveFixtureActionLifecycle(context, page, fx);
      test.skip(outcome.skippedReason !== null, outcome.skippedReason ?? undefined);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("22-07 — reassessment: running operations diagnosis again leaves at least two cycles in the fixture's history", async () => {
      const again = await runFixtureDiagnosis(context, page, fx, snapshotId);
      expect(cycleOrdinal(fx, again), "the fixture's cycle history must have grown (a later cycle ordinal)").toBeGreaterThan(lastCycleOrdinal);
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Operations closed loop (acceptance fixture)


  test("22-08 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
    expect(fx?.serverErrors ?? []).toEqual([]);
  });

  test("22-09 — record findings for the acceptance report", () => {
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
