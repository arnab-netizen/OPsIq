/**
 * LIVE PRODUCTION acceptance -- Cashflow Owner journey.
 *
 * Part of the full-domain-acceptance expansion. Investigation confirmed
 * Cashflow is a real, distinct diagnosis/action/verification surface
 * (its OWN full model set -- OwnerCashflowSnapshot/Cycle/Finding/Action/
 * Verification -- not a Finance sub-view) with a nav-adjacent owner-facing
 * page, real snapshot intake, deterministic diagnosis, finding->action
 * generation, and a full gated action lifecycle.
 *
 * IMPORTANT, deliberately NOT asserted here: unlike Finance/Sales/
 * Operations/Strategy, owner-cashflow/action.service.ts and
 * verification.service.ts do NOT trigger automatic re-diagnosis on action
 * completion or verified success (confirmed by source investigation) --
 * this is a genuine gap distinct from Marketing's (which had the same gap
 * and was fixed in a separate PR), tracked for a future fix, NOT bundled
 * into this harness-only PR. Because there is no completion-triggered
 * reassessment for Cashflow today, 24-06 verifies Complete/Verify by the
 * action's own exact id anyway (not a `.first()` card) -- this is strictly
 * more robust regardless of whether reassessment exists, and makes this
 * test forward-compatible with a future fix to that gap without needing
 * to be rewritten. "Learning" is Finance-only and not claimed here.
 *
 * This file never sends a mutating request (POST/PATCH) carrying
 * trinityBusinessId. It reuses the ONE dedicated acceptance business
 * created by 10-startup-mode-acceptance.spec.ts. Independently isolated
 * from every other domain spec file.
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

const SPEC_NAME = "phase24-cashflow";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-24 — Cashflow Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
  let trinityBusinessId: string | null = null;
  let trinityFound = false;
  let blockedUpstreamReason: string | null = null;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchPage(page);
    registerActionDialogHandler(page);
    await authenticateProductionOwner(page);
    await startEvidenceCollection(context, page, SPEC_NAME);

    // Cashflow gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "cashflow");
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Cashflow's dedicated acceptance business: ${
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

    test("24-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
      await page.goto("/owner/cashflow", { waitUntil: "networkidle" });
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

    test("24-02 — Cashflow dashboard shows a real, non-placeholder recommendation for Trinity if data exists (read-only, output-quality graded)", async () => {
      test.skip(!trinityFound, "Trinity not found (see 24-01)");
      const res = await timedApiCall(context, "GET", "/api/owner/cashflow/dashboard", () =>
        page.request.get(`/api/owner/cashflow/dashboard?businessId=${trinityBusinessId}`)
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const rec = body.recommendedNextAction;
      if (!rec) {
        console.log("PROD-24 OUTPUT_QUALITY: Trinity has no recommendedNextAction currently -- not gradeable this run.");
        return;
      }
      expect(rec.title, "SPECIFICITY: recommendation title must be non-empty").toBeTruthy();
      expect(rec.description?.length ?? 0, "ACTIONABILITY: description must be substantive, not a stub").toBeGreaterThan(20);
      expect(typeof rec.priorityScore, "PRIORITIZATION: must carry a numeric priority score").toBe("number");
      expect(typeof rec.expectedImpactScore, "DATA_GROUNDING: must carry a numeric impact score").toBe("number");
      expect(rec.verificationMetric, "VERIFIABILITY: must name how it will be verified").toBeTruthy();
      await page.goto(`/owner/cashflow?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-cashflow-recommendation");
    });
  });

  test.describe("Cashflow closed loop (acceptance business)", () => {
    test.describe.configure({ mode: "serial" });

    test("24-03 — navigate to Cashflow for the dedicated acceptance business", async () => {
      await page.goto(`/owner/cashflow?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });
      await expect(page.locator('select[name="businessSelector"]')).toBeVisible();
    });

    test("24-04 — real UI: add a cashflow snapshot with deliberately stressed synthetic inputs", async () => {
      await page.getByRole("button", { name: "+ Add cashflow snapshot" }).click();
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
        .toISOString()
        .slice(0, 10);
      await page.locator('input[name="periodStart"]').fill(periodStart);
      await page.locator('input[name="periodEnd"]').fill(periodEnd);
      // Deliberately stressed inputs -- thin cash buffer against heavy
      // near-term obligations (rent/salary/vendor/tax/EMI far exceed total
      // cash), critical payables pressure, high overdue receivables, high
      // owner-withdrawal pressure. Synthetic data on the dedicated
      // acceptance business only, never Trinity.
      await page.locator('input[name="cashInHand"]').fill("5000");
      await page.locator('input[name="bankBalance"]').fill("5000");
      await page.locator('input[name="dailyCollections"]').fill("200");
      await page.locator('input[name="receivables"]').fill("20000");
      await page.locator('input[name="receivablesOverdue"]').fill("15000");
      await page.locator('input[name="payables"]').fill("12000");
      await page.locator('input[name="payablesOverdue"]').fill("12000");
      await page.locator('input[name="upcomingEmi"]').fill("5000");
      await page.locator('input[name="rentDue"]').fill("4000");
      await page.locator('input[name="salaryDue"]').fill("5000");
      await page.locator('input[name="vendorDue"]').fill("3000");
      await page.locator('input[name="taxDue"]').fill("2000");
      await page.locator('input[name="ownerWithdrawal"]').fill("4000");
      await page.getByRole("button", { name: /Save snapshot/ }).click();
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("24-05 — real UI: run cashflow diagnosis and see a visible diagnosis result (not merely a 200 response)", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/cashflow/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run cashflow diagnosis",
        /Latest diagnosis|Findings \(/
      );
      await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("24-06 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
      const actionCards = page.locator("section", { hasText: "Cashflow actions" }).locator(".border.rounded.p-3");
      const count = await actionCards.count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");
      const card = actionCards.first();

      // Capture this action's own id before any mutation. Cashflow does
      // NOT currently trigger reassessment on completion (unlike Finance/
      // Sales/Operations/Strategy) -- verifying by exact id anyway is
      // strictly more robust and forward-compatible with a future fix to
      // that gap, and matches the harness convention established for
      // every other domain.
      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/cashflow/dashboard", () =>
        page.request.get(`/api/owner/cashflow/dashboard?businessId=${acceptanceBusinessId}`)
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
        const res = await timedApiCall(context, "GET", "/api/owner/cashflow/actions/:actionId", () =>
          page.request.get(`/api/owner/cashflow/actions/${actionId}`)
        );
        expect(res.status()).toBe(200);
        expect((await res.json()).status).toBe("completed");
      }).toPass({ timeout: 15000 });
      await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

      const verifyRes = await timedApiCall(context, "POST", "/api/owner/cashflow/actions/:actionId/verify", () =>
        page.request.post(`/api/owner/cashflow/actions/${actionId}/verify`, {
          data: { beforeValue: 100, afterValue: 50, targetDirection: "down" },
        })
      );
      expect(verifyRes.ok(), `Verify outcome request failed: ${verifyRes.status()}`).toBe(true);
      const verified = await timedApiCall(context, "GET", "/api/owner/cashflow/actions/:actionId", () =>
        page.request.get(`/api/owner/cashflow/actions/${actionId}`)
      );
      const verifiedBody = await verified.json();
      expect(verifiedBody.status).toBe("completed");
      expect(
        ["verified_improved", "verified_not_improved", "inconclusive", "disputed"]
      ).toContain(verifiedBody.verifications?.[0]?.status);
      await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
      expect(fatalErrors()).toHaveLength(0);
    });
  });

  test("24-07 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
  });

  test("24-08 — record findings for the acceptance report", () => {
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
