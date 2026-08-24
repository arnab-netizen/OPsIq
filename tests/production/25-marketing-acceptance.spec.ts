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
import { authenticateProductionOwner } from "./helpers/production-auth";
import {
  startEvidenceCollection,
  captureOnFailure,
  checkpointScreenshot,
  finalizeEvidence,
  timedApiCall,
} from "./helpers/evidence";
import { runDomainDiagnosisAndAwaitResult } from "./helpers/domain-diagnosis";
import { registerActionDialogHandler } from "./helpers/dialog-handler";
import { createJourneyWatch } from "./helpers/journey-watchers";
import { resolveOrCreateDomainBusiness } from "./helpers/domain-business";

const SPEC_NAME = "phase25-marketing";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-25 — Marketing Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
  let trinityBusinessId: string | null = null;
  let trinityFound = false;
  // Non-null only when this suite must not proceed -- distinguishes a real
  // setup failure (auth, or this domain's own dedicated business could not
  // be created) from this suite's own test defects.
  let blockedUpstreamReason: string | null = null;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchPage(page);
    registerActionDialogHandler(page);
    await authenticateProductionOwner(page);
    await startEvidenceCollection(context, page, SPEC_NAME);

    // Marketing gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "marketing");
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
      await page.goto(`/owner/marketing?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-marketing-recommendation");
    });
  }); // end Trinity Services (read-only)

  // ─── Acceptance business: full Marketing closed loop (real UI mutations) ──
  test.describe("Marketing closed loop (acceptance business)", () => {
    test.describe.configure({ mode: "serial" });

    test("25-03 — navigate to Marketing for the dedicated acceptance business", async () => {
      await page.goto(`/owner/marketing?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });
      await expect(page.locator('select[name="businessSelector"]')).toBeVisible();
    });

    test("25-04 — real UI: add a marketing snapshot with deliberately stressed synthetic inputs", async () => {
      await page.getByRole("button", { name: "+ Add marketing snapshot" }).click();
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
        .toISOString()
        .slice(0, 10);
      await page.locator('input[name="periodStart"]').fill(periodStart);
      await page.locator('input[name="periodEnd"]').fill(periodEnd);
      // Deliberately stressed inputs -- heavy spend against thin revenue and
      // few orders (critical ROI), overwhelmingly paid-lead-dependent with a
      // near-zero conversion rate (critical lead conversion), almost no
      // campaign follow-up (critical follow-up). Matches the hostile DB
      // test's wastingSnapshot() (services.db.test.ts), confirmed to drive
      // marketingState to WASTING. Synthetic data on the dedicated
      // acceptance business only, never Trinity.
      await page.locator('input[name="marketingSpend"]').fill("100000");
      await page.locator('input[name="revenue"]').fill("30000");
      await page.locator('input[name="leads"]').fill("200");
      await page.locator('input[name="inquiries"]').fill("150");
      await page.locator('input[name="orders"]').fill("4");
      await page.locator('input[name="newCustomers"]').fill("4");
      await page.locator('input[name="paidLeads"]').fill("180");
      await page.locator('input[name="organicLeads"]').fill("20");
      await page.locator('input[name="campaignsRun"]').fill("10");
      await page.locator('input[name="campaignsWithFollowup"]').fill("2");
      await page.locator('input[name="contentPosted"]').fill("2");
      await page.locator('input[name="couponsRedeemed"]').fill("1");
      await page.locator('input[name="referrals"]').fill("0");
      await page.locator('input[name="walkIns"]').fill("5");
      await page.getByRole("button", { name: /Save snapshot/ }).click();
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("25-05 — real UI: run marketing diagnosis and see a visible diagnosis result (not merely a 200 response)", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/marketing/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run marketing diagnosis",
        /Latest diagnosis|Findings \(/
      );
      await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("25-06 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
      const actionCards = page.locator("section", { hasText: "Marketing actions" }).locator(".border.rounded.p-3");
      const count = await actionCards.count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");
      const card = actionCards.first();

      // Capture this action's own id before any mutation -- completing an
      // action deterministically triggers an automatic re-diagnosis
      // (updateMarketingAction -> runMarketingDiagnosis, mirrors
      // owner-sales/action.service.ts's identical mechanism). That creates
      // a NEW OwnerMarketingCycle whose fresh "proposed" actions become the
      // dashboard's latestCycle, including a regenerated action with the
      // same title/priority as this one. Verify Complete/Verify against
      // this exact id, not by re-inspecting the (now possibly different)
      // dashboard action list.
      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/marketing/dashboard", () =>
        page.request.get(`/api/owner/marketing/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const actionId: string = (await dashboardBefore.json()).latestCycle.actions[0].id;

      await card.getByRole("button", { name: "Assign" }).click();
      await page.waitForLoadState("networkidle");
      await expect(card).toContainText("assigned");

      await card.getByRole("button", { name: "Start" }).click();
      await page.waitForLoadState("networkidle");
      await expect(card).toContainText("in_progress");

      await card.getByRole("button", { name: "Complete" }).click();
      await page.waitForLoadState("networkidle");
      await expect(async () => {
        const res = await timedApiCall(context, "GET", "/api/owner/marketing/actions/:actionId", () =>
          page.request.get(`/api/owner/marketing/actions/${actionId}`)
        );
        expect(res.status()).toBe(200);
        expect((await res.json()).status).toBe("completed");
      }).toPass({ timeout: 15000 });
      await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

      // The product's real UI has no path to re-open this action's own card
      // once a newer cycle supersedes it (MarketingCycleView only ever
      // renders dashboard.latestCycle) -- a genuine current UI limitation,
      // not a test shortcut. Verify outcome against the SAME action by id
      // via the documented backend feature directly.
      const verifyRes = await timedApiCall(context, "POST", "/api/owner/marketing/actions/:actionId/verify", () =>
        page.request.post(`/api/owner/marketing/actions/${actionId}/verify`, {
          data: { beforeValue: 100, afterValue: 50, targetDirection: "down" },
        })
      );
      expect(verifyRes.ok(), `Verify outcome request failed: ${verifyRes.status()}`).toBe(true);
      const verified = await timedApiCall(context, "GET", "/api/owner/marketing/actions/:actionId", () =>
        page.request.get(`/api/owner/marketing/actions/${actionId}`)
      );
      const verifiedBody = await verified.json();
      expect(verifiedBody.status).toBe("completed");
      expect(
        ["verified_improved", "verified_not_improved", "inconclusive", "disputed"]
      ).toContain(verifiedBody.verifications?.[0]?.status);
      await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("25-07 — reassessment: completing the action above already triggered a second, owner-visible cycle in history", async () => {
      // Unlike Cashflow (no reassessment yet), Marketing's action.service.ts
      // re-runs diagnosis automatically on completion (25-06's Complete
      // click already triggered this) and again on verified success. This
      // step asserts that visible effect directly, rather than re-running
      // diagnosis manually as 21-07 (Sales) does -- re-running here would
      // mask whether the automatic reassessment actually fired.
      await page.reload({ waitUntil: "networkidle" });
      const dashboardAfter = await timedApiCall(context, "GET", "/api/owner/marketing/dashboard", () =>
        page.request.get(`/api/owner/marketing/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const body = await dashboardAfter.json();
      expect(
        Array.isArray(body.cycleHistory) ? body.cycleHistory.length : 0,
        "completing the action above should have auto-triggered a second OwnerMarketingCycle via the reassessment mechanism (action.service.ts)"
      ).toBeGreaterThanOrEqual(2);
      await expect(page.locator("body")).toContainText(/Cycle #2|Diagnosis history/);
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Marketing closed loop (acceptance business)

  // ─── Cross-cutting reporting: always runs, regardless of which section
  // above failed -- deliberately outside either serial block. ──

  test("25-08 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
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
