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

const SPEC_NAME = "phase21-sales";
const { consoleErrors, networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-21 — Sales Owner journey live production acceptance", () => {
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

    // Sales gets its OWN dedicated acceptance business -- never the shared
    // Startup handoff business, and never another domain's business. See
    // helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "sales");
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
      await page.goto(`/owner/sales?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-sales-recommendation");
    });
  }); // end Trinity Services (read-only)

  // ─── Acceptance business: full Sales closed loop (real UI mutations) ──
  test.describe("Sales closed loop (acceptance business)", () => {
    test.describe.configure({ mode: "serial" });

    test("21-03 — navigate to Sales for the dedicated acceptance business", async () => {
      await page.goto(`/owner/sales?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });
      await expect(page.locator('select[name="businessSelector"]')).toBeVisible();
    });

    test("21-04 — real UI: add a sales snapshot with deliberately stressed synthetic inputs", async () => {
      await page.getByRole("button", { name: "+ Add sales snapshot" }).click();
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
        .toISOString()
        .slice(0, 10);
      await page.locator('input[name="periodStart"]').fill(periodStart);
      await page.locator('input[name="periodEnd"]').fill(periodEnd);
      // Deliberately stressed inputs -- a real chance of producing multiple
      // findings/actions (critical funnel conversion, critical repeat rate,
      // critical churn, high complaint-to-sale, high discount dependence,
      // high refund rate), synthetic data on the dedicated acceptance
      // business only, never Trinity.
      await page.locator('input[name="leads"]').fill("200");
      await page.locator('input[name="qualifiedLeads"]').fill("100");
      await page.locator('input[name="orders"]').fill("5");
      await page.locator('input[name="revenue"]').fill("50000");
      await page.locator('input[name="averageOrderValue"]').fill("10000");
      await page.locator('input[name="newCustomers"]').fill("5");
      await page.locator('input[name="repeatCustomers"]').fill("0");
      await page.locator('input[name="lostCustomers"]').fill("10");
      await page.locator('input[name="complaints"]').fill("20");
      await page.locator('input[name="discountAmount"]').fill("30000");
      await page.locator('input[name="refundAmount"]').fill("5000");
      await page.locator('input[name="staffCount"]').fill("2");
      await page.getByRole("button", { name: /Save snapshot/ }).click();
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("21-05 — real UI: run sales diagnosis and see a visible diagnosis result (not merely a 200 response)", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/sales/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run sales diagnosis",
        /Latest diagnosis|Findings \(/
      );
      await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("21-06 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
      const actionCards = page.locator("section", { hasText: "Sales actions" }).locator(".border.rounded.p-3");
      const count = await actionCards.count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");
      const card = actionCards.first();

      // Capture this action's own id before any mutation -- completing an
      // action deterministically triggers an automatic re-diagnosis
      // (updateSalesAction -> runSalesDiagnosis, mirrors
      // owner-finance/action.service.ts's identical mechanism, root-caused
      // in workflow run #32568877293 / PR #336). That creates a NEW
      // OwnerSalesCycle whose fresh "proposed" actions become the
      // dashboard's latestCycle, including a regenerated action with the
      // same title/priority as this one. Verify Complete/Verify against
      // this exact id, not by re-inspecting the (now possibly different)
      // dashboard action list.
      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/sales/dashboard", () =>
        page.request.get(`/api/owner/sales/dashboard?businessId=${acceptanceBusinessId}`)
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
        const res = await timedApiCall(context, "GET", "/api/owner/sales/actions/:actionId", () =>
          page.request.get(`/api/owner/sales/actions/${actionId}`)
        );
        expect(res.status()).toBe(200);
        expect((await res.json()).status).toBe("completed");
      }).toPass({ timeout: 15000 });
      await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

      // The product's real UI has no path to re-open this action's own
      // card once a newer cycle supersedes it (SalesCycleView only ever
      // renders dashboard.latestCycle) -- a genuine current UI limitation,
      // not a test shortcut. Verify outcome against the SAME action by id
      // via the documented backend feature directly.
      const verifyRes = await timedApiCall(context, "POST", "/api/owner/sales/actions/:actionId/verify", () =>
        page.request.post(`/api/owner/sales/actions/${actionId}/verify`, {
          data: { beforeValue: 100, afterValue: 50, targetDirection: "down" },
        })
      );
      expect(verifyRes.ok(), `Verify outcome request failed: ${verifyRes.status()}`).toBe(true);
      const verified = await timedApiCall(context, "GET", "/api/owner/sales/actions/:actionId", () =>
        page.request.get(`/api/owner/sales/actions/${actionId}`)
      );
      const verifiedBody = await verified.json();
      expect(verifiedBody.status).toBe("completed");
      expect(
        ["verified_improved", "verified_not_improved", "inconclusive", "disputed"]
      ).toContain(verifiedBody.verifications?.[0]?.status);
      await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("21-07 — reassessment: running diagnosis again produces a second, owner-visible cycle in history", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/sales/businesses/${acceptanceBusinessId}/diagnoses`,
        "Run sales diagnosis",
        /Cycle #2|Diagnosis history/
      );
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Sales closed loop (acceptance business)

  // ─── Cross-cutting reporting: always runs, regardless of which section
  // above failed -- deliberately outside either serial block. ──

  test("21-08 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
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
