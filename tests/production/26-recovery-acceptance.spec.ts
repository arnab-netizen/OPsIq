/**
 * LIVE PRODUCTION acceptance -- Recovery Owner journey.
 *
 * Part of the full-domain-acceptance expansion. A dedicated investigation
 * confirmed Recovery is a real, distinct domain -- its own Prisma model set
 * (RecoveryCycle/RecoveryFinding/RecoveryAction/RecoveryVerification, keyed
 * off OwnerMetricSnapshot rather than a Recovery-prefixed snapshot model),
 * its own status machine (domain/founder-recovery/action-status.ts), and a
 * nav-reachable owner-facing page (/owner/recovery, linked from owner/
 * page.tsx and owner/home/page.tsx since PR #256 -- the historical
 * navigation gap this expansion's task list referenced no longer exists on
 * current main; confirmed from source, not assumed).
 *
 * Recovery's page diverges structurally from Marketing/Sales/Operations/
 * Strategy/Cashflow in ways this spec follows deliberately rather than
 * copying their pattern blindly:
 * - Snapshot fields match MetricSnapshotZodInput (revenue/totalCosts/
 *   orderCount/repeatCustomers/deliveryCost/etc, not a domain-specific
 *   schema) -- button text is "+ Add metric snapshot", not "+ Add recovery
 *   snapshot".
 * - Diagnosis is "Run diagnosis cycle" against POST .../cycles (not
 *   .../diagnoses), and the actions section renders as "Recovery actions".
 * - Completion prompts for "Completion notes:" and "Actual outcome:" (not
 *   "Completion evidence:") -- helpers/dialog-handler.ts was extended with
 *   an "Actual outcome" case for this, confirmed necessary from source.
 * - Verification takes only `afterValue` (baseline/target/direction are
 *   already stored on the action from cycle generation, unlike Sales/
 *   Cashflow's `{beforeValue, afterValue, targetDirection}` shape) -- this
 *   spec computes an afterValue from the action's own baselineValue/
 *   targetValue/direction so it deterministically reaches target
 *   regardless of which finding produced the first action, rather than
 *   hardcoding a value tied to one specific metric.
 *
 * IMPORTANT, deliberately NOT asserted here: a dedicated investigation
 * found founder-recovery's action/verification services do NOT (yet)
 * trigger automatic re-diagnosis on completion or verified success, unlike
 * every other owner-domain action service. A fix (mirroring Cashflow's
 * PR #341) is tracked and implemented separately in PR #344 -- once merged,
 * a follow-up to this spec will add the reassessment assertion, the same
 * two-step sequence Cashflow itself went through (spec first, reassessment
 * assertion added once its own fix landed). 26-06 verifies Complete/Verify
 * by the action's own exact id anyway (not a `.first()` card), which is
 * strictly more robust regardless of whether reassessment exists yet, and
 * makes this test forward-compatible with PR #344 without needing to be
 * rewritten.
 *
 * This file never sends a mutating request (POST/PATCH) carrying
 * trinityBusinessId. It uses its OWN dedicated acceptance business (created
 * via helpers/domain-business.ts, never Startup's handoff business or
 * another domain's business) for every mutating step. Independently
 * isolated from every other domain spec file -- a Recovery failure here can
 * never suppress any other domain's tests, and vice versa.
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

const SPEC_NAME = "phase26-recovery";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

test.describe("PROD-26 — Recovery Owner journey live production acceptance", () => {
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

    // Recovery gets its OWN dedicated acceptance business -- never the
    // shared Startup handoff business, and never another domain's business.
    // See helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "recovery");
    } catch (e) {
      blockedUpstreamReason = `BLOCKED_SETUP: could not create Recovery's dedicated acceptance business: ${
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

    test("26-01 — locate Trinity Services in the real business selector (or skip Trinity steps if unavailable)", async () => {
      await page.goto("/owner/recovery", { waitUntil: "networkidle" });
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

    test("26-02 — Recovery dashboard reflects Trinity's real data if a cycle exists (read-only)", async () => {
      test.skip(!trinityFound, "Trinity not found (see 26-01)");
      const res = await timedApiCall(context, "GET", "/api/owner/recovery/dashboard", () =>
        page.request.get(`/api/owner/recovery/dashboard?businessId=${trinityBusinessId}`)
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      if (!body.hasData) {
        console.log("PROD-26 OUTPUT_QUALITY: Trinity has no Recovery cycle yet -- not gradeable this run.");
        return;
      }
      expect(typeof body.latestCycle.healthScore, "must carry a numeric health score").toBe("number");
      expect(body.latestCycle.summary?.length ?? 0, "cycle summary must be substantive, not a stub").toBeGreaterThan(10);
      await page.goto(`/owner/recovery?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
      await checkpointScreenshot(context, page, SPEC_NAME, "trinity-recovery-cycle");
    });
  }); // end Trinity Services (read-only)

  // ─── Acceptance business: full Recovery closed loop (real UI mutations) ──
  test.describe("Recovery closed loop (acceptance business)", () => {
    test.describe.configure({ mode: "serial" });

    test("26-03 — navigate to Recovery for the dedicated acceptance business", async () => {
      await page.goto(`/owner/recovery?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });
      await expect(page.locator('select[name="businessSelector"]')).toBeVisible();
    });

    test("26-04 — real UI: add a metric snapshot with deliberately stressed synthetic inputs", async () => {
      await page.getByRole("button", { name: "+ Add metric snapshot" }).click();
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
        .toISOString()
        .slice(0, 10);
      await page.locator('input[name="periodStart"]').fill(periodStart);
      await page.locator('input[name="periodEnd"]').fill(periodEnd);
      // Deliberately stressed inputs -- weak repeat-customer rate (30%,
      // below the WEAK_REPEAT_RATE threshold) and high delivery-cost
      // leakage (12% of revenue), matching the hostile DB test's own
      // failingPeriod1() (db-persistence.db.test.ts), confirmed to produce
      // WEAK_REPEAT_RATE + DELIVERY_COST_LEAKAGE findings. Synthetic data
      // on the dedicated acceptance business only, never Trinity.
      await page.locator('input[name="revenue"]').fill("100000");
      await page.locator('input[name="totalCosts"]').fill("95000");
      await page.locator('input[name="orderCount"]').fill("1000");
      await page.locator('input[name="newCustomers"]').fill("70");
      await page.locator('input[name="repeatCustomers"]').fill("30");
      await page.locator('input[name="deliveryCost"]').fill("12000");
      await page.getByRole("button", { name: /Save snapshot/ }).click();
      await page.waitForLoadState("networkidle");
      await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("26-05 — real UI: run a diagnosis cycle and see a visible cycle result (not merely a 200 response)", async () => {
      await runDomainDiagnosisAndAwaitResult(
        page,
        `/api/owner/recovery/businesses/${acceptanceBusinessId}/cycles`,
        "Run diagnosis cycle",
        /Latest cycle|Findings \(/
      );
      await checkpointScreenshot(context, page, SPEC_NAME, "cycle-result");
      expect(fatalErrors()).toHaveLength(0);
    });

    test("26-06 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
      const actionCards = page.locator("section", { hasText: "Recovery actions" }).locator(".border.rounded.p-3");
      const count = await actionCards.count();
      test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");
      const card = actionCards.first();

      // Capture this action's own id AND its baseline/target/direction
      // before any mutation -- these determine the after-value the verify
      // step below needs to deterministically reach target, and (once PR
      // #344's reassessment fix lands) completing the action will create a
      // new cycle whose fresh "proposed" actions become the dashboard's
      // latestCycle, so verifying by exact id is the forward-compatible
      // convention already used by every other domain spec.
      const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/recovery/dashboard", () =>
        page.request.get(`/api/owner/recovery/dashboard?businessId=${acceptanceBusinessId}`)
      );
      const firstAction = (await dashboardBefore.json()).latestCycle.actions[0];
      const actionId: string = firstAction.id;
      const { baselineValue, targetValue, direction } = firstAction as {
        baselineValue: number;
        targetValue: number | null;
        direction: "up" | "down";
      };

      await card.getByRole("button", { name: "Assign" }).click();
      await page.waitForLoadState("networkidle");
      await expect(card).toContainText("assigned");

      await card.getByRole("button", { name: "Start" }).click();
      await page.waitForLoadState("networkidle");
      await expect(card).toContainText("in_progress");

      await card.getByRole("button", { name: "Complete" }).click();
      await page.waitForLoadState("networkidle");
      await expect(async () => {
        const res = await timedApiCall(context, "GET", "/api/owner/recovery/actions/:actionId", () =>
          page.request.get(`/api/owner/recovery/actions/${actionId}`)
        );
        expect(res.status()).toBe(200);
        expect((await res.json()).status).toBe("completed");
      }).toPass({ timeout: 15000 });
      await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

      // Verify directly against the API rather than the UI's "Verify
      // outcome" prompt -- Recovery's verify body is just {afterValue}
      // (baseline/target/direction already live on the action row), so an
      // explicit after-value computed from this action's own target
      // deterministically reaches it regardless of which finding produced
      // the first action, unlike relying on the shared dialog handler's
      // fixed "50" (tuned for other domains' beforeValue=100/down-direction
      // shape, not guaranteed to reach an "up"-direction target here).
      const target = targetValue ?? baselineValue;
      const afterValue = direction === "up" ? target + 1 : target - 1;
      const verifyRes = await timedApiCall(context, "POST", "/api/owner/recovery/actions/:actionId/verify", () =>
        page.request.post(`/api/owner/recovery/actions/${actionId}/verify`, {
          data: { afterValue },
        })
      );
      expect(verifyRes.ok(), `Verify outcome request failed: ${verifyRes.status()}`).toBe(true);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.result?.reachedTarget, `expected afterValue ${afterValue} to reach target ${target}`).toBe(true);

      const verified = await timedApiCall(context, "GET", "/api/owner/recovery/actions/:actionId", () =>
        page.request.get(`/api/owner/recovery/actions/${actionId}`)
      );
      const verifiedBody = await verified.json();
      expect(verifiedBody.status).toBe("completed");
      expect(
        ["verified_improved", "verified_not_improved", "inconclusive", "disputed"]
      ).toContain(verifiedBody.verifications?.[0]?.status);
      await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
      expect(fatalErrors()).toHaveLength(0);
    });
  }); // end Recovery closed loop (acceptance business)

  // ─── Cross-cutting reporting: always runs, regardless of which section
  // above failed -- deliberately outside either serial block. ──

  test("26-07 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
  });

  test("26-08 — record findings for the acceptance report", () => {
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
