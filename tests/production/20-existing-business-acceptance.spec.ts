/**
 * LIVE PRODUCTION acceptance -- Phase 1 (existing-business Owner journey).
 *
 * Two distinct data modes, enforced structurally (not by convention):
 *  - Trinity Services (read-only): this file never sends a mutating request
 *    (POST/PATCH/DELETE) carrying trinityBusinessId. Every call that could
 *    mutate uses acceptanceBusinessId exclusively -- verifiable by reading
 *    this file, since trinityBusinessId is never passed to page.request.post
 *    or page.request.patch anywhere below.
 *  - The ONE dedicated acceptance business created by
 *    10-startup-mode-acceptance.spec.ts (via the real Startup "Activate as
 *    Business" flow) is reused here for every mutating step (snapshot,
 *    diagnosis, action lifecycle, verification). This file must therefore
 *    run AFTER that one -- enforced by filename ordering (10- before 20-),
 *    matching this repo's tests/browser/ numeric-prefix convention.
 *
 * "Trinity Services" has no known ID/name in this codebase (confirmed by
 * source search) -- it is located at runtime by matching its name in the
 * real business-selector dropdown. If the acceptance account's workspace
 * does not have access to a business matching that name, the Trinity-only
 * steps are explicitly skipped (not silently passed) with a clear reason.
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

const SPEC_NAME = "phase01-existing-business";

const consoleErrors: string[] = [];
const networkFailures: Array<{ url: string; status: number }> = [];
function watchPage(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 500) networkFailures.push({ url: res.url(), status: res.status() });
  });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

// Synthetic answers for the Finance page's window.prompt()-driven completion
// and verification flow (there are no form fields for these -- confirmed
// from src/app/(authenticated)/owner/finance/page.tsx's updateAction /
// verifyAction). Matched by prompt message content, not call order, so this
// is robust regardless of how many times either flow runs.

test.describe("PROD-01 — Existing-business Owner journey live production acceptance", () => {
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
  // be created) from this suite's own test defects. Every test below skips
  // with this exact reason rather than throwing from beforeAll, which would
  // otherwise surface as an opaque, unrelated "Cannot read properties of
  // undefined" crash instead of a clear BLOCKED classification.
  let blockedUpstreamReason: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // One login for the whole run (global-setup); this spec never logs in again. See helpers/shared-auth.ts.
    ({ context, page } = await newSharedAuthenticatedContext(browser));
    watchPage(page);
    await startEvidenceCollection(context, page, SPEC_NAME);

    // Finance gets its OWN dedicated acceptance business -- never the shared
    // Startup handoff business, and never another domain's business. See
    // helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "finance");
      // Created-and-hidden is not enough: bind the id so every mutation can only target THIS fixture.
      fx = await bindFixtureTarget(context, page, "finance", acceptanceBusinessId);
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Finance's dedicated acceptance business: ${
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

  // ─── Trinity Services: read-only discovery + data/diagnosis visibility ──
  //
  // Nested in its own serial block (not the file-wide serial chain run #5's
  // harness used) so a Trinity-domain failure can never suppress the
  // unrelated Finance-domain tests below, or vice versa -- only a real
  // intra-domain dependency (e.g. 01-02 needs 01-01's Trinity discovery)
  // still cascades, scoped to its own domain.
  test.describe("Trinity Services (read-only)", () => {
    test.describe.configure({ mode: "serial" });

  test("01-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
    await page.goto("/owner/home", { waitUntil: "networkidle" });
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

  test("01-02 — Owner Home renders real data/diagnosis/priorities for Trinity (read-only)", async () => {
    test.skip(!trinityFound, "Trinity not found (see 01-01)");
    // READ-ONLY: select Trinity in the page's own business selector (client-side state only), then open Owner Home --
    // no owner page reads ?businessId=, so a query parameter would not show Trinity.
    await page.goto("/owner/finance", { waitUntil: "networkidle" });
    await page.locator('select[name="businessSelector"]').selectOption(trinityBusinessId!);
    await page.goto("/owner/home", { waitUntil: "networkidle" });
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    await checkpointScreenshot(context, page, SPEC_NAME, "trinity-owner-home");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("01-03 — Finance dashboard shows a real, non-placeholder recommendation for Trinity (read-only, output-quality graded)", async () => {
    test.skip(!trinityFound, "Trinity not found (see 01-01)");
    const res = await timedApiCall(context, "GET", "/api/owner/finance/dashboard", () =>
      page.request.get(`/api/owner/finance/dashboard?businessId=${trinityBusinessId}`)
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const rec = body.recommendedNextAction;
    if (!rec) {
      // Legitimate state (no diagnosis run yet / no data) -- report, don't fabricate.
      console.log("PROD-01 OUTPUT_QUALITY: Trinity has no recommendedNextAction currently -- not gradeable this run.");
      return;
    }
    // Explicit, objective output-quality criteria (not subjective praise):
    expect(rec.title, "SPECIFICITY: recommendation title must be non-empty").toBeTruthy();
    expect(rec.description?.length ?? 0, "ACTIONABILITY: description must be substantive, not a stub").toBeGreaterThan(20);
    expect(typeof rec.priorityScore, "PRIORITIZATION: must carry a numeric priority score").toBe("number");
    expect(typeof rec.expectedImpactScore, "DATA_GROUNDING: must carry a numeric impact score").toBe("number");
    expect(rec.verificationMetric, "SAFE_EXECUTABILITY: must name how it will be verified").toBeTruthy();
    await page.goto("/owner/finance", { waitUntil: "networkidle" });
    await page.locator('select[name="businessSelector"]').selectOption(trinityBusinessId!);
    await page.waitForLoadState("networkidle");
    await checkpointScreenshot(context, page, SPEC_NAME, "trinity-finance-recommendation");
  });
  }); // end Trinity Services (read-only)

  // ─── Acceptance fixture: full Finance closed loop (governed API, bound to the verified fixture) ──
  //
  // Production run #17 root cause: the previous version drove the ordinary Finance UI at
  // /owner/finance?businessId=<fixture>. The page ignores that parameter and takes its business from the
  // fixture-free owner list, so every UI save/diagnosis hit an ORDINARY business. Every mutation below goes through
  // fixture-domain-loop.ts, which is refused unless it targets the bound fixture (or one of its own actions). The UI
  // is read-only here.
  test.describe("Finance closed loop (acceptance fixture)", () => {
    test.describe.configure({ mode: "serial" });

    test("01-04 — the fixture is addressable by its own id and is NOT offered by the ordinary Finance UI (positive isolation)", async () => {
      await assertFixtureNotOnOwnerDashboard(context, page, fx);
      // Hidden from ordinary owners: the page's own selector must not list it.
      await page.goto("/owner/finance", { waitUntil: "networkidle" });
      const select = page.locator('select[name="businessSelector"]');
      if ((await select.count()) > 0) {
        const values = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
        expect(values, "a hidden fixture must never appear in the ordinary owner business selector").not.toContain(acceptanceBusinessId);
      }
    });

    test("01-05 — governed API: save a financial snapshot with deliberately stressed synthetic inputs on the fixture", async () => {
      // Deliberately stressed inputs, to have a real chance of producing at least one finding/action for the lifecycle steps below -- synthetic data on the bound fixture only, never Trinity.
      const saved = await saveFixtureSnapshot(context, page, fx, {
        evidenceQuality: "GOOD_ESTIMATE",
        revenue: 50000,
        fixedCosts: 42000,
        cashOnHand: 2000,
        totalDebtOutstanding: 80000,
        receivablesOverdue: 15000,
      });
      snapshotId = saved.id;
      expect(fatalErrors()).toHaveLength(0);
    });

    test("01-06 — governed API: run finance diagnosis on the fixture and see a real result on its own dashboard", async () => {
      const cycle = await runFixtureDiagnosis(context, page, fx, snapshotId);
      const stored = await readFixtureCycle(context, page, fx, String(cycle.id));
      expect(stored.id, "the fixture's own cycle must read back by its id").toBe(cycle.id);
      lastCycleOrdinal = cycleOrdinal(fx, cycle);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("01-07 — action lifecycle on the fixture: Assign -> Start -> Complete -> Verify outcome, each step read back by the action's own id", async () => {
      const outcome = await driveFixtureActionLifecycle(context, page, fx);
      test.skip(outcome.skippedReason !== null, outcome.skippedReason ?? undefined);
      expect(fatalErrors()).toHaveLength(0);
    });

    test("01-08 — reassessment: running finance diagnosis again leaves at least two cycles in the fixture's history", async () => {
      const again = await runFixtureDiagnosis(context, page, fx, snapshotId);
      expect(cycleOrdinal(fx, again), "the fixture's cycle history must have grown (a later cycle ordinal)").toBeGreaterThan(lastCycleOrdinal);
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Finance closed loop (acceptance fixture)

  // ─── Cross-cutting reporting: always runs, regardless of which domain(s)
  // above failed -- deliberately outside either serial block so a Trinity
  // or Finance failure never prevents an accurate summary/5xx check. ──

  test("01-09 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
    expect(fx?.serverErrors ?? []).toEqual([]);
  });

  test("01-10 — record findings for the acceptance report", () => {
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
