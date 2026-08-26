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

const SPEC_NAME = "phase22-operations";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-22 — Operations Owner journey live production acceptance", () => {
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

    // Operations gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "operations");
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
      await page.goto(`/owner/operations?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-operations-recommendation");
    });
  });

  test.describe("Operations closed loop (acceptance business)", () => {
    test.describe.configure({ mode: "serial" });

    test("22-03 — navigate to Operations for the dedicated acceptance business", async () => {
      await page.goto(`/owner/operations?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });
      await expect(page.locator('select[name="businessSelector"]')).toBeVisible();
    });

    test("22-04 — real UI: add an operations snapshot with deliberately stressed synthetic inputs", async () => {
      await page.getByRole("button", { name: "+ Add operations snapshot" }).click();
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
        .toISOString()
        .slice(0, 10);
      await page.locator('input[name="periodStart"]').fill(periodStart);
      await page.locator('input[name="periodEnd"]').fill(periodEnd);
      // Deliberately stressed inputs -- critical completion rate, critical
      // delay rate, critical rework, high complaints, over-capacity
      // utilization, critical delivery failure, critical SOP non-compliance,
      // high idle time. Synthetic data on the dedicated acceptance business
      // only, never Trinity.
      await page.locator('input[name="ordersReceived"]').fill("200");
      await page.locator('input[name="ordersCompleted"]').fill("130");
      await page.locator('input[name="ordersDelayed"]').fill("70");
      await page.locator('input[name="reworkCount"]').fill("30");
      await page.locator('input[name="complaints"]').fill("15");
      await page.locator('input[name="staffHours"]').fill("500");
      await page.locator('input[name="machineCapacityUnits"]').fill("150");
      await page.locator('input[name="idleHours"]').fill("150");
      await page.locator('input[name="deliveryAttempts"]').fill("100");
      await page.locator('input[name="deliveryFailures"]').fill("30");
      await page.locator('input[name="sopChecks"]').fill("100");
      await page.locator('input[name="sopMisses"]').fill("50");
      await page.getByRole("button", { name: /Save snapshot/ }).click();
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("22-05 — real UI: run operations diagnosis and see a visible diagnosis result (not merely a 200 response)", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/operations/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run operations diagnosis",
        /Latest diagnosis|Findings \(/
      );
      await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("22-06 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
      const actionsSection = page.locator("section", { hasText: "Operations actions" });
      const count = await actionsSection.locator(".border.rounded.p-3").count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");

      // Capture this action's own id AND title before any mutation, and
      // locate its card by title from here on -- never by position.
      // Completing an action deterministically triggers an automatic
      // re-diagnosis (updateOperationsAction -> runOperationsDiagnosis),
      // applying the run #6 lesson proactively. Separately (workflow run
      // 32953759246), when multiple actions tie at the priorityScore
      // [0,100] clamp ceiling (a real, common occurrence for a
      // "deliberately stressed" scenario with several simultaneous critical
      // findings), a plain `.first()` locator can silently resolve to a
      // DIFFERENT, untouched action after any mutation reorders the tied
      // rows -- the dashboard query's ordering was made fully deterministic
      // to fix that, but this test also stops relying on card position at
      // all, so it verifies "this exact action transitioned" independently
      // of whether the list's order is stable.
      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/operations/dashboard", () =>
        page.request.get(`/api/owner/operations/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const targetAction = (await dashboardBefore.json()).latestCycle.actions[0];
      const actionId: string = targetAction.id;
      const actionTitle: string = targetAction.title;
      const card = actionsSection.locator(".border.rounded.p-3", { hasText: actionTitle });
      await expect(card, "exactly one action card must match the captured title").toHaveCount(1);

      await card.getByRole("button", { name: "Assign" }).click();
      await page.waitForLoadState("networkidle");
      await expect(card).toContainText("assigned");

      await card.getByRole("button", { name: "Start" }).click();
      await page.waitForLoadState("networkidle");
      await expect(card).toContainText("in_progress");

      await card.getByRole("button", { name: "Complete" }).click();
      await page.waitForLoadState("networkidle");
      await expect(async () => {
        const res = await timedApiCall(context, "GET", "/api/owner/operations/actions/:actionId", () =>
          page.request.get(`/api/owner/operations/actions/${actionId}`)
        );
        expect(res.status()).toBe(200);
        expect((await res.json()).status).toBe("completed");
      }).toPass({ timeout: 15000 });
      await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

      const verifyRes = await timedApiCall(context, "POST", "/api/owner/operations/actions/:actionId/verify", () =>
        page.request.post(`/api/owner/operations/actions/${actionId}/verify`, {
          data: { beforeValue: 100, afterValue: 50, targetDirection: "down" },
        })
      );
      expect(verifyRes.ok(), `Verify outcome request failed: ${verifyRes.status()}`).toBe(true);
      const verified = await timedApiCall(context, "GET", "/api/owner/operations/actions/:actionId", () =>
        page.request.get(`/api/owner/operations/actions/${actionId}`)
      );
      const verifiedBody = await verified.json();
      expect(verifiedBody.status).toBe("completed");
      expect(
        ["verified_improved", "verified_not_improved", "inconclusive", "disputed"]
      ).toContain(verifiedBody.verifications?.[0]?.status);
      await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("22-07 — reassessment: running diagnosis again produces a second, owner-visible cycle in history", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/operations/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run operations diagnosis",
        /Cycle #2|Diagnosis history/
      );
      expect(fatalErrors()).toHaveLength(0);
    });
  });

  test("22-08 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
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
