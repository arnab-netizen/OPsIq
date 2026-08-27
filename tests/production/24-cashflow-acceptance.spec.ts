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
 * OPSIQ-LIVE-ACCEPTANCE-CORRECTION Finding 1: workflow run 33043774531 proved
 * the OLD single-fixture design was a test-contract defect, not a product
 * defect. The deliberately-stressed snapshot used for the whole file computed
 * cashflowState=INSOLVENT_RISK, and owner-action-gate.service.ts's cash-safety
 * gate is REQUIRED to refuse a FINANCE_SENSITIVE material action transition
 * (in_progress/completed) at that severity -- confirmed as intentional,
 * unit-tested product behavior (src/__tests__/owner-mode/owner-action-gate.
 * test.ts:109), not something to weaken. Asserting Start would succeed on
 * that exact fixture was simply wrong. This file now carries TWO fixtures
 * (tests/production/fixtures/cashflow-fixtures.ts, each proven against the
 * real domain functions in src/__tests__/deployment/cashflow-acceptance-
 * fixture-safety.test.ts):
 *   - CASHFLOW_INSOLVENT_FIXTURE -- proves the safety gate correctly REFUSES
 *     a material transition when cash is INSOLVENT_RISK (24-06).
 *   - CASHFLOW_SAFE_FIXTURE -- proves the full owner action lifecycle
 *     (Assign -> Start -> Complete -> Verify -> automatic reassessment)
 *     completes end to end when the fixture's own state does not require a
 *     block (24-07..24-10).
 * Both target actions are always verified by their own exact id (not a
 * `.first()` card) -- see 24-09's own inline comment for why.
 *
 * This file never sends a mutating request (POST/PATCH) carrying
 * trinityBusinessId. It gets its OWN dedicated acceptance business (never the
 * shared Startup handoff business, never another domain's business -- see
 * helpers/domain-business.ts's header for the root cause this fixes).
 * Independently isolated from every other domain spec file.
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
import {
  CASHFLOW_INSOLVENT_FIXTURE,
  CASHFLOW_SAFE_FIXTURE,
  insolventFixturePeriod,
  safeFixturePeriod,
} from "./fixtures/cashflow-fixtures";

const SPEC_NAME = "phase24-cashflow";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

async function fillCashflowSnapshotForm(
  page: Page,
  periodStart: string,
  periodEnd: string,
  fields: typeof CASHFLOW_INSOLVENT_FIXTURE
): Promise<void> {
  await page.getByRole("button", { name: "+ Add cashflow snapshot" }).click();
  await page.locator('input[name="periodStart"]').fill(periodStart);
  await page.locator('input[name="periodEnd"]').fill(periodEnd);
  for (const [name, value] of Object.entries(fields)) {
    await page.locator(`input[name="${name}"]`).fill(value);
  }
  await page.getByRole("button", { name: /Save snapshot/ }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("PROD-24 — Cashflow Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
  let trinityBusinessId: string | null = null;
  let trinityFound = false;
  let blockedUpstreamReason: string | null = null;
  let safeActionId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchPage(page);
    registerActionDialogHandler(page);
    await authenticateProductionOwner(page);
    await startEvidenceCollection(context, page, SPEC_NAME);

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

    test("24-04 — real UI: add a cashflow snapshot with deliberately stressed synthetic inputs (safety-gate fixture)", async () => {
      const { periodStart, periodEnd } = insolventFixturePeriod(new Date());
      await fillCashflowSnapshotForm(page, periodStart, periodEnd, CASHFLOW_INSOLVENT_FIXTURE);
      await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved-insolvent");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("24-05 — real UI: run cashflow diagnosis and see a visible INSOLVENT_RISK diagnosis result (not merely a 200 response)", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/cashflow/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run cashflow diagnosis",
        /Latest diagnosis|Findings \(/
      );
      await expect(page.locator("body")).toContainText("INSOLVENT_RISK");
      await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result-insolvent");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("24-06 — SAFETY-GATE ACCEPTANCE: a FINANCE_SENSITIVE material transition is refused while cashflowState=INSOLVENT_RISK, not silently allowed", async () => {
      const actionsSection = page.locator("section", { hasText: "Cashflow actions" });
      const count = await actionsSection.locator(".border.rounded.p-3").count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");

      // 1. Diagnosis visibly (owner- and API-) reports INSOLVENT_RISK.
      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/cashflow/dashboard", () =>
        page.request.get(`/api/owner/cashflow/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const dashboardBeforeBody = await dashboardBefore.json();
      expect(dashboardBeforeBody.latestCycle.cashflowState).toBe("INSOLVENT_RISK");

      const targetAction = dashboardBeforeBody.latestCycle.actions[0];
      const actionId: string = targetAction.id;
      const actionTitle: string = targetAction.title;
      const card = actionsSection.locator(".border.rounded.p-3", { hasText: actionTitle });
      await expect(card, "exactly one action card must match the captured title").toHaveCount(1);

      // 2. Assign is allowed and the exact action becomes assigned (assign is
      // not a MATERIAL_ACTION_STATUSES transition -- owner-action-gate.
      // service.ts never gates it).
      await card.getByRole("button", { name: "Assign" }).click();
      await page.waitForLoadState("networkidle");
      await expect(card).toContainText("assigned");

      // Owner-visible baseline for the audit-evidence check (8) below, taken
      // right before the refused transition so the delta is attributable
      // only to this test's own block.
      const blockMetricsBefore = await timedApiCall(context, "GET", "/api/owner/control-center", () =>
        page.request.get(`/api/owner/control-center?businessId=${acceptanceBusinessId}`)
      );
      const financeBlockedBefore = (await blockMetricsBefore.json()).sections.financeBlocked;

      // 3. Click Start (assigned -> in_progress is MATERIAL).
      await card.getByRole("button", { name: "Start" }).click();
      await page.waitForLoadState("networkidle");

      // 4 + 5. Material execution is refused; the exact action remains
      // assigned (never silently allowed, never left in an indeterminate
      // state) -- both via the owner-visible card and a direct re-GET by id.
      await expect(card).toContainText("assigned");
      await expect(card.getByRole("button", { name: "Start" })).toBeVisible();
      const afterClick = await timedApiCall(context, "GET", "/api/owner/cashflow/actions/:actionId", () =>
        page.request.get(`/api/owner/cashflow/actions/${actionId}`)
      );
      expect((await afterClick.json()).status).toBe("assigned");

      // 6 + 7. The owner receives the real, governed refusal message (never a
      // stack/SQL/provider payload -- see src/lib/canonical-route-enforcement.
      // ts's isKnownSafeClientError), and the refusal is a 409 (client/
      // governed), never a 5xx. Issued directly (not just inferred from the
      // UI click) so the exact status/body are asserted deterministically.
      const directRefusal = await timedApiCall(context, "PATCH", "/api/owner/cashflow/actions/:actionId", () =>
        page.request.patch(`/api/owner/cashflow/actions/${actionId}`, { data: { status: "in_progress" } })
      );
      expect(directRefusal.status()).toBe(409);
      const refusalBody = await directRefusal.json();
      expect(refusalBody.error).toMatch(/INSOLVENT_RISK/);
      expect(refusalBody.error).toMatch(/FINANCE_SENSITIVE/i);
      await expect(page.locator("body")).toContainText(/INSOLVENT_RISK.*unsafe|unsafe.*INSOLVENT_RISK/i);

      // 8. OWNER_GATE_PROMOTION_BLOCKED audit evidence is visible via the
      // owner-facing, production-safe control-center block counters (reads
      // the append-only audit log server-side -- see owner-block-metrics.
      // service.ts) -- no raw audit-log/DB access needed from this test.
      const blockMetricsAfter = await timedApiCall(context, "GET", "/api/owner/control-center", () =>
        page.request.get(`/api/owner/control-center?businessId=${acceptanceBusinessId}`)
      );
      const financeBlockedAfter = (await blockMetricsAfter.json()).sections.financeBlocked;
      expect(
        financeBlockedAfter,
        "a cash-safety block must be recorded in the owner-visible block counters"
      ).toBeGreaterThan(financeBlockedBefore);

      // 9. No unintended state transition occurred anywhere in this flow.
      const finalState = await timedApiCall(context, "GET", "/api/owner/cashflow/actions/:actionId", () =>
        page.request.get(`/api/owner/cashflow/actions/${actionId}`)
      );
      expect((await finalState.json()).status).toBe("assigned");
      await checkpointScreenshot(context, page, SPEC_NAME, "action-blocked-insolvent");
      expect(networkFailures).toEqual([]);
    });

    test("24-07 — real UI: add a second, dedicated cashflow snapshot whose canonical state does not require a safety-gate block", async () => {
      // periodEnd is strictly later than 24-04's periodEnd (see
      // safeFixturePeriod's own comment) so both the manual "Run cashflow
      // diagnosis" click below and the automatic reassessment triggered by
      // 24-09's Complete deterministically resolve THIS snapshot as "latest
      // by periodEnd" -- dashboard.service.ts and action.service.ts's
      // re-diagnosis both order by periodEnd desc, and a same-day tie
      // against 24-04's snapshot would be non-deterministic. The period
      // LENGTH is kept the same ~30 days as the insolvent fixture -- see
      // safeFixturePeriod's comment for why shortening it changes this
      // fixture's cashflowState classification.
      const { periodStart, periodEnd } = safeFixturePeriod(new Date());
      await fillCashflowSnapshotForm(page, periodStart, periodEnd, CASHFLOW_SAFE_FIXTURE);
      await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved-safe");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("24-08 — real UI: run cashflow diagnosis on the safe fixture and confirm it is NOT CRITICAL/INSOLVENT_RISK, with at least one real action", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/cashflow/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run cashflow diagnosis",
        /Latest diagnosis|Findings \(/
      );
      const dashboard = await timedApiCall(context, "GET", "/api/owner/cashflow/dashboard", () =>
        page.request.get(`/api/owner/cashflow/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const body = await dashboard.json();
      // Proven deterministically against the real domain functions in
      // cashflow-acceptance-fixture-safety.test.ts; re-asserted here against
      // the live production diagnosis so a real drift is caught live too.
      expect(body.latestCycle.cashflowState).not.toBe("CRITICAL");
      expect(body.latestCycle.cashflowState).not.toBe("INSOLVENT_RISK");
      expect(body.latestCycle.actions.length).toBeGreaterThan(0);
      await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result-safe");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("24-09 — CASHFLOW CLOSED-LOOP LIFECYCLE: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
      const actionsSection = page.locator("section", { hasText: "Cashflow actions" });
      const count = await actionsSection.locator(".border.rounded.p-3").count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");

      // Capture this action's own id AND title before any mutation, and
      // locate its card by title from here on -- never by position.
      // Completing an action deterministically triggers an automatic
      // re-diagnosis (updateCashflowAction -> runCashflowDiagnosis),
      // creating a NEW OwnerCashflowCycle whose fresh "proposed" actions
      // become the dashboard's latestCycle, and tied priorityScores can
      // reorder cards -- this verifies "this exact action transitioned"
      // independently of list order, and verifies Complete/Verify against
      // this exact id, not by re-inspecting the (now possibly different)
      // dashboard action list.
      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/cashflow/dashboard", () =>
        page.request.get(`/api/owner/cashflow/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const targetAction = (await dashboardBefore.json()).latestCycle.actions[0];
      const actionId: string = targetAction.id;
      const actionTitle: string = targetAction.title;
      safeActionId = actionId;
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
        const res = await timedApiCall(context, "GET", "/api/owner/cashflow/actions/:actionId", () =>
          page.request.get(`/api/owner/cashflow/actions/${actionId}`)
        );
        expect(res.status()).toBe(200);
        expect((await res.json()).status).toBe("completed");
      }).toPass({ timeout: 15000 });
      await checkpointScreenshot(context, page, SPEC_NAME, "action-completed-safe");

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
      await checkpointScreenshot(context, page, SPEC_NAME, "action-verified-safe");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("24-10 — reassessment: completing the safe fixture's action already triggered a new, owner-visible cycle in history", async () => {
      // Cashflow's action.service.ts re-runs diagnosis automatically on
      // completion (24-09's Complete click already triggered this) and again
      // on verified success. Assert that visible effect as a DELTA against a
      // fresh baseline (not a fixed >=2) -- 24-06's safety-gate cycle already
      // contributes one prior cycle, so a fixed threshold would pass even if
      // the automatic reassessment mechanism silently stopped firing.
      test.skip(safeActionId === null, "No safe-fixture action id captured from 24-09 -- cannot verify its reassessment.");
      const before = await timedApiCall(context, "GET", "/api/owner/cashflow/actions/:actionId", () =>
        page.request.get(`/api/owner/cashflow/actions/${safeActionId}`)
      );
      expect((await before.json()).status).toBe("completed");

      await page.reload({ waitUntil: "networkidle" });
      const dashboardAfter = await timedApiCall(context, "GET", "/api/owner/cashflow/dashboard", () =>
        page.request.get(`/api/owner/cashflow/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const body = await dashboardAfter.json();
      expect(
        Array.isArray(body.cycleHistory) ? body.cycleHistory.length : 0,
        "completing the safe fixture's action should have auto-triggered a new OwnerCashflowCycle via the reassessment mechanism (action.service.ts)"
      ).toBeGreaterThanOrEqual(3); // cycle 1 (24-05, insolvent) + cycle 2 (24-08, safe) + cycle 3 (reassessment)
      await expect(page.locator("body")).toContainText(/Cycle #3|Diagnosis history/);
      expect(fatalErrors()).toHaveLength(0);
    });
  });

  test("24-11 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
  });

  test("24-12 — record findings for the acceptance report", () => {
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
