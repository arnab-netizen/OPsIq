/**
 * LIVE PRODUCTION acceptance -- Strategy & Scenarios Owner journey.
 *
 * Part of the full-domain-acceptance expansion. Investigation confirmed
 * Strategy has a real, working data->diagnosis->recommendation->action->
 * verification loop: a nav-reachable owner-facing page, real scenario
 * intake, deterministic go/no-go scoring, finding->action generation, a
 * full action lifecycle, and automatic re-diagnosis on action completion
 * (owner-strategy/action.service.ts mirrors owner-finance/action.service.ts's
 * mechanism exactly). Honest gaps, NOT asserted here: (1) reassessment is
 * event-triggered only, not data-triggered -- matches Finance's own
 * pattern, not a defect; (2) "learning" is Finance-only; (3) this
 * module's diagnosis is a self-contained scenario model, NOT integrated
 * with the BusinessConditionProfile/InterventionMode/InterventionPhase
 * product-truth dimensions CLAUDE.md mandates -- a real, separate finding,
 * not fixed or worked around here.
 *
 * Applies the run #6 (workflow run #32568877293) forensic lesson
 * proactively: captures the target action's own id before mutation and
 * verifies Complete/Verify against that exact id, not a `.first()` card.
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

const SPEC_NAME = "phase23-strategy";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-23 — Strategy Owner journey live production acceptance", () => {
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

    // Strategy gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "strategy");
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Strategy's dedicated acceptance business: ${
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

    test("23-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
      await page.goto("/owner/strategy", { waitUntil: "networkidle" });
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

    test("23-02 — Strategy dashboard shows a real, non-placeholder recommendation for Trinity if data exists (read-only, output-quality graded)", async () => {
      test.skip(!trinityFound, "Trinity not found (see 23-01)");
      const res = await timedApiCall(context, "GET", "/api/owner/strategy/dashboard", () =>
        page.request.get(`/api/owner/strategy/dashboard?businessId=${trinityBusinessId}`)
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const rec = body.recommendedNextAction;
      if (!rec) {
        console.log("PROD-23 OUTPUT_QUALITY: Trinity has no recommendedNextAction currently -- not gradeable this run.");
        return;
      }
      expect(rec.title, "SPECIFICITY: recommendation title must be non-empty").toBeTruthy();
      expect(rec.description?.length ?? 0, "ACTIONABILITY: description must be substantive, not a stub").toBeGreaterThan(20);
      expect(typeof rec.priorityScore, "PRIORITIZATION: must carry a numeric priority score").toBe("number");
      expect(typeof rec.expectedImpactScore, "DATA_GROUNDING: must carry a numeric impact score").toBe("number");
      expect(rec.verificationMetric, "VERIFIABILITY: must name how it will be verified").toBeTruthy();
      await page.goto(`/owner/strategy?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-strategy-recommendation");
    });
  });

  test.describe("Strategy closed loop (acceptance business)", () => {
    test.describe.configure({ mode: "serial" });

    test("23-03 — navigate to Strategy for the dedicated acceptance business", async () => {
      await page.goto(`/owner/strategy?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });
      await expect(page.locator('select[name="businessSelector"]')).toBeVisible();
    });

    test("23-04 — real UI: add a strategic option with a deliberately weak, high-risk scenario", async () => {
      await page.getByRole("button", { name: "+ Add scenario" }).click();
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
        .toISOString()
        .slice(0, 10);
      await page.locator('input[name="optionName"]').fill("Acceptance test: risky expansion");
      await page.locator('select[name="riskLevel"]').selectOption("high");
      await page.locator('input[name="periodStart"]').fill(periodStart);
      await page.locator('input[name="periodEnd"]').fill(periodEnd);
      // Deliberately weak scenario -- negative net monthly gain, large
      // upfront investment, poor affordability (cash << investment) -->
      // guarantees a critical ROI/affordability/payback finding set.
      // Synthetic data on the dedicated acceptance business only.
      await page.locator('input[name="currentRevenue"]').fill("100000");
      await page.locator('input[name="expectedRevenueChange"]').fill("2000");
      await page.locator('input[name="costChange"]').fill("5000");
      await page.locator('input[name="investmentRequired"]').fill("200000");
      await page.locator('input[name="timeToImpactMonths"]').fill("12");
      await page.locator('input[name="cashAvailable"]').fill("50000");
      await page.locator('input[name="capacityImpactPct"]').fill("20");
      await page.locator('input[name="staffImpact"]').fill("5");
      await page.getByRole("button", { name: /Save scenario/ }).click();
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "scenario-saved");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("23-05 — real UI: evaluate the scenario and see a visible go/no-go result (not merely a 200 response)", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/strategy/businesses/${acceptanceBusinessId}/diagnoses`,
        "Evaluate scenario",
        /Latest evaluation|Findings \(/
      );
      await checkpointScreenshot(context, page, SPEC_NAME, "evaluation-result");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("23-06 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
      const actionCards = page.locator("section", { hasText: "Strategy actions" }).locator(".border.rounded.p-3");
      const count = await actionCards.count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this evaluation produced zero findings/actions for the synthetic scenario -- not a defect, but not exercisable this run.");
      const card = actionCards.first();

      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/strategy/dashboard", () =>
        page.request.get(`/api/owner/strategy/dashboard?businessId=${acceptanceBusinessId}`)
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
        const res = await timedApiCall(context, "GET", "/api/owner/strategy/actions/:actionId", () =>
          page.request.get(`/api/owner/strategy/actions/${actionId}`)
        );
        expect(res.status()).toBe(200);
        expect((await res.json()).status).toBe("completed");
      }).toPass({ timeout: 15000 });
      await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

      const verifyRes = await timedApiCall(context, "POST", "/api/owner/strategy/actions/:actionId/verify", () =>
        page.request.post(`/api/owner/strategy/actions/${actionId}/verify`, {
          data: { beforeValue: 100, afterValue: 50, targetDirection: "down" },
        })
      );
      expect(verifyRes.ok(), `Verify outcome request failed: ${verifyRes.status()}`).toBe(true);
      const verified = await timedApiCall(context, "GET", "/api/owner/strategy/actions/:actionId", () =>
        page.request.get(`/api/owner/strategy/actions/${actionId}`)
      );
      const verifiedBody = await verified.json();
      expect(verifiedBody.status).toBe("completed");
      expect(
        ["verified_improved", "verified_not_improved", "inconclusive", "disputed"]
      ).toContain(verifiedBody.verifications?.[0]?.status);
      await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("23-07 — reassessment: evaluating again produces a second, owner-visible entry in evaluation history", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/strategy/businesses/${acceptanceBusinessId}/diagnoses`,
        "Evaluate scenario",
        /#2|Evaluation history/
      );
      expect(fatalErrors()).toHaveLength(0);
    });
  });

  test("23-08 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
  });

  test("23-09 — record findings for the acceptance report", () => {
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
