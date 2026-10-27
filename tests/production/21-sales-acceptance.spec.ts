/**
 * LIVE PRODUCTION acceptance -- Sales Owner journey.
 *
 * First of the full-domain-acceptance expansion (see the owner's "expand
 * live acceptance to all Owner domains" directive). Sales was chosen first
 * because a dedicated investigation confirmed it is the one newly-scoped
 * domain that is FULLY_IMPLEMENTED against the full domain contract this
 * program requires: real owner-facing page (nav-reachable), real snapshot
 * intake, real deterministic diagnosis, real finding->action generation,
 * a real action lifecycle (Assign/Start/Complete/Block), real
 * before/after verification, and automatic re-diagnosis on action
 * completion (owner_sales_action.service.ts mirrors
 * owner-finance/action.service.ts's "On action completion ... trigger
 * re-diagnosis from latest snapshot" exactly). Learning (a verified
 * outcome influencing a later recommendation) is Finance-only in this
 * codebase today -- not claimed or tested here.
 *
 * Because the reassessment-on-completion mechanism is proven identical to
 * Finance's, this spec captures the target action's own id BEFORE any
 * mutation and verifies Complete/Verify against that exact id (not a
 * `.first()`-by-priority card) from the start -- applying the run #6
 * (workflow run #32568877293) forensic lesson proactively instead of
 * repeating it for a new domain.
 *
 * This file never sends a mutating request (POST/PATCH) carrying
 * trinityBusinessId -- Trinity Services is read-only, verifiable by
 * reading this file. It uses its OWN dedicated acceptance business
 * (created via helpers/domain-business.ts, never Startup's handoff
 * business or another domain's business) for every mutating step --
 * see that helper's header for why sharing one business across domains
 * is unsafe. Independently isolated from 20-existing-business-
 * acceptance.spec.ts's own Trinity/Finance sections -- a Sales failure
 * here can never suppress Finance, Startup, or any other domain's tests,
 * and vice versa.
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
  readFixtureSnapshots,
  readFixtureCycle,
  cycleOrdinal,
  driveFixtureActionLifecycle,
} from "./helpers/fixture-domain-loop";

const SPEC_NAME = "phase21-sales";
const { consoleErrors, networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-21 — Sales Owner journey live production acceptance", () => {
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

    // Sales gets its OWN dedicated acceptance business -- never the shared
    // Startup handoff business, and never another domain's business. See
    // helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "sales");
      // Created-and-hidden is not enough: bind the id so every mutation below can only target THIS fixture.
      fx = await bindFixtureTarget(context, page, "sales", acceptanceBusinessId);
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Sales's dedicated acceptance business: ${
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

    test("21-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
      await page.goto("/owner/sales", { waitUntil: "networkidle" });
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

    test("21-02 — Sales dashboard shows a real, non-placeholder recommendation for Trinity if data exists (read-only, output-quality graded)", async () => {
      test.skip(!trinityFound, "Trinity not found (see 21-01)");
      const res = await timedApiCall(context, "GET", "/api/owner/sales/dashboard", () =>
        page.request.get(`/api/owner/sales/dashboard?businessId=${trinityBusinessId}`)
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const rec = body.recommendedNextAction;
      if (!rec) {
        console.log("PROD-21 OUTPUT_QUALITY: Trinity has no recommendedNextAction currently -- not gradeable this run.");
        return;
      }
      expect(rec.title, "SPECIFICITY: recommendation title must be non-empty").toBeTruthy();
      expect(rec.description?.length ?? 0, "ACTIONABILITY: description must be substantive, not a stub").toBeGreaterThan(20);
      expect(typeof rec.priorityScore, "PRIORITIZATION: must carry a numeric priority score").toBe("number");
      expect(typeof rec.expectedImpactScore, "DATA_GROUNDING: must carry a numeric impact score").toBe("number");
      expect(rec.verificationMetric, "VERIFIABILITY: must name how it will be verified").toBeTruthy();
      // READ-ONLY: select Trinity in the page's own business selector (client-side state only) -- the page does not
      // read ?businessId=, so a query parameter would not show Trinity.
      await page.goto("/owner/sales", { waitUntil: "networkidle" });
      await page.locator('select[name="businessSelector"]').selectOption(trinityBusinessId!);
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-sales-recommendation");
    });
  }); // end Trinity Services (read-only)

  // ─── Acceptance fixture: full Sales closed loop (governed API, bound to the verified fixture) ──
  //
  // Production run #17 root cause: the previous version drove the ordinary Sales UI at
  // /owner/sales?businessId=<fixture>. The page ignores that parameter and takes its business from the fixture-free
  // owner list, so every UI save/diagnosis hit an ORDINARY business. Every mutation below is a fixtureMutate() call
  // that is refused unless it targets the bound fixture (or one of its own actions). The UI is read-only here.
  test.describe("Sales closed loop (acceptance fixture)", () => {
    test.describe.configure({ mode: "serial" });

    test("21-03 — the fixture is addressable by its own id and is NOT offered by the ordinary Sales UI (positive isolation)", async () => {
      await assertFixtureNotOnOwnerDashboard(context, page, fx);
      // Hidden from ordinary owners: the Sales page's own selector must not list it.
      await page.goto("/owner/sales", { waitUntil: "networkidle" });
      const select = page.locator('select[name="businessSelector"]');
      if ((await select.count()) > 0) {
        const values = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
        expect(values, "a hidden fixture must never appear in the ordinary owner business selector").not.toContain(acceptanceBusinessId);
      }
    });

    test("21-04 — governed API: save a sales snapshot with deliberately stressed synthetic inputs on the fixture", async () => {
      // Deliberately stressed inputs -- a real chance of producing multiple findings/actions (critical funnel
      // conversion, critical repeat rate, critical churn, high complaint-to-sale, high discount dependence, high
      // refund rate). Synthetic data on the bound fixture only.
      const saved = await saveFixtureSnapshot(context, page, fx, {
        leads: 200,
        qualifiedLeads: 100,
        orders: 5,
        revenue: 50000,
        averageOrderValue: 10000,
        newCustomers: 5,
        repeatCustomers: 0,
        lostCustomers: 10,
        complaints: 20,
        discountAmount: 30000,
        refundAmount: 5000,
        staffCount: 2,
      });
      snapshotId = saved.id;
      expect((await readFixtureSnapshots(context, page, fx)).map((r) => r.id), "the fixture's own snapshot list must contain the snapshot just saved").toContain(snapshotId);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("21-05 — governed API: run sales diagnosis on the fixture and see a real diagnosis result on its own dashboard", async () => {
      const cycle = await runFixtureDiagnosis(context, page, fx, snapshotId);
      const stored = await readFixtureCycle(context, page, fx, String(cycle.id));
      expect(stored.id, "the fixture's own cycle must read back by its id").toBe(cycle.id);
      lastCycleOrdinal = cycleOrdinal(fx, cycle);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("21-06 — action lifecycle on the fixture: Assign -> Start -> Complete -> Verify outcome, each step read back by the action's own id", async () => {
      const outcome = await driveFixtureActionLifecycle(context, page, fx);
      test.skip(outcome.skippedReason !== null, outcome.skippedReason ?? undefined);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("21-07 — reassessment: running diagnosis again leaves at least two cycles in the fixture's history", async () => {
      const again = await runFixtureDiagnosis(context, page, fx, snapshotId);
      expect(cycleOrdinal(fx, again), "the fixture's cycle history must have grown (a later cycle ordinal)").toBeGreaterThan(lastCycleOrdinal);
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Sales closed loop (acceptance fixture)

  // ─── Cross-cutting reporting: always runs, regardless of which section
  // above failed -- deliberately outside either serial block. ──

  test("21-08 — no 5xx responses were observed anywhere in this journey (page traffic and the fixture's API calls)", () => {
    expect(networkFailures).toEqual([]);
    expect(fx?.serverErrors ?? []).toEqual([]);
  });

  test("21-09 — record findings for the acceptance report", () => {
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
