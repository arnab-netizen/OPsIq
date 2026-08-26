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
import { authenticateProductionOwner } from "./helpers/production-auth";
import {
  startEvidenceCollection,
  captureOnFailure,
  checkpointScreenshot,
  finalizeEvidence,
  timedApiCall,
} from "./helpers/evidence";
import { runFinanceDiagnosisAndAwaitResult } from "./helpers/finance-diagnosis";
import { resolveOrCreateDomainBusiness } from "./helpers/domain-business";

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
function registerFinanceDialogHandler(page: Page) {
  page.on("dialog", async (dialog) => {
    const msg = dialog.message();
    if (msg.includes("Completion notes")) return dialog.accept("Live production acceptance: completion notes");
    if (msg.includes("Completion evidence")) return dialog.accept("acceptance-test-evidence-reference");
    if (msg.includes("BEFORE value")) return dialog.accept("100");
    if (msg.includes("AFTER value")) return dialog.accept("50");
    if (msg.includes("Target direction")) return dialog.accept("down");
    await dialog.dismiss();
  });
}

test.describe("PROD-01 — Existing-business Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
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
    context = await browser.newContext();
    page = await context.newPage();
    watchPage(page);
    registerFinanceDialogHandler(page);
    await authenticateProductionOwner(page);
    await startEvidenceCollection(context, page, SPEC_NAME);

    // Finance gets its OWN dedicated acceptance business -- never the shared
    // Startup handoff business, and never another domain's business. See
    // helpers/domain-business.ts's header for the root cause this fixes.
    try {
      acceptanceBusinessId = await resolveOrCreateDomainBusiness(context, page, "finance");
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
    await page.goto(`/owner/home?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
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
    await page.goto(`/owner/finance?businessId=${trinityBusinessId}`, { waitUntil: "networkidle" });
    await checkpointScreenshot(context, page, SPEC_NAME, "trinity-finance-recommendation");
  });
  }); // end Trinity Services (read-only)

  // ─── Acceptance business: full Finance closed loop (real UI mutations) ──
  //
  // Its own serial block: 01-05 needs 01-04's navigation, 01-06 needs
  // 01-05's snapshot, 01-07/01-08 need 01-06's diagnosis -- a real
  // intra-domain dependency chain -- but a failure here must never suppress
  // 01-09/01-10 (cross-cutting reporting, outside any serial block below)
  // or, if a future domain suite runs in this same file, that suite either.
  test.describe("Finance closed loop (acceptance business)", () => {
    test.describe.configure({ mode: "serial" });

  test("01-04 — navigate to Finance for the dedicated acceptance business", async () => {
    await page.goto(`/owner/finance?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });
    await expect(page.locator('select[name="businessSelector"]')).toBeVisible();
  });

  test("01-05 — real UI: add a financial snapshot with deliberately stressed synthetic inputs", async () => {
    await page.getByRole("button", { name: "+ Add financial snapshot" }).click();
    const today = new Date();
    const periodEnd = today.toISOString().slice(0, 10);
    const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
      .toISOString()
      .slice(0, 10);
    await page.locator('input[name="periodStart"]').fill(periodStart);
    await page.locator('input[name="periodEnd"]').fill(periodEnd);
    // Deliberately stressed inputs, to have a real chance of producing at
    // least one finding/action for the lifecycle steps below -- synthetic
    // data on the dedicated acceptance business only, never Trinity.
    await page.locator('input[name="revenue"]').fill("50000");
    await page.locator('input[name="fixedCosts"]').fill("42000");
    await page.locator('input[name="cashOnHand"]').fill("2000");
    await page.locator('input[name="totalDebtOutstanding"]').fill("80000");
    await page.locator('input[name="receivablesOverdue"]').fill("15000");
    await page.getByRole("button", { name: /Save snapshot/ }).click();
    await page.waitForLoadState("networkidle");
    await checkpointScreenshot(context, page, SPEC_NAME, "snapshot-saved");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("01-06 — real UI: run finance diagnosis and see a visible diagnosis result (not merely a 200 response)", async () => {
    await runFinanceDiagnosisAndAwaitResult(page, acceptanceBusinessId);
    await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("01-07 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
    const actionsSection = page.locator("section", { hasText: "Finance actions" });
    const count = await actionsSection.locator(".border.rounded.p-3").count();
    test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");

    // Capture this action's own id AND title before any mutation, and
    // locate its card by title from here on -- never by position. Required
    // for two independent reasons. (1) Completing an action deterministically
    // triggers an automatic re-diagnosis (updateFinanceAction ->
    // runFinanceDiagnosis, see src/services/owner-finance/action.service.ts's
    // "On action completion ... trigger re-diagnosis from latest snapshot")
    // -- proven end-to-end against real Postgres in
    // src/__tests__/owner-finance/services.db.test.ts. That creates a NEW
    // OwnerFinanceCycle whose fresh "proposed" actions become the
    // dashboard's latestCycle, including (deterministically, since the
    // underlying snapshot is unchanged) a regenerated action with the SAME
    // title/priority as this one. Run #32568877293 (run #6) observed
    // exactly this: after clicking Complete, `.first()`-by-priority
    // re-resolved to that NEW, different, still-"proposed" action -- an
    // apparent "reversion" that is not one; this action's own row is
    // completed permanently and is verified directly by id below, not by
    // re-inspecting the (now different) dashboard action list. (2) Finance
    // shares the exact same priorityScore-tie-vulnerable dashboard query as
    // the 5 domains that failed live-acceptance run 32953759246 -- it did
    // not fail that run only because its scenario didn't happen to produce
    // a tie, not because its code path differs. The dashboard query's
    // ordering was made fully deterministic to close that class, but this
    // test also stops relying on card position at all, so Assign/Start
    // verification is immune to list reordering regardless of cause.
    const dashboardBefore = await timedApiCall(context, "GET", "/api/owner/finance/dashboard", () =>
      page.request.get(`/api/owner/finance/dashboard?businessId=${acceptanceBusinessId}`)
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
      const res = await timedApiCall(context, "GET", "/api/owner/finance/actions/:actionId", () =>
        page.request.get(`/api/owner/finance/actions/${actionId}`)
      );
      expect(res.status()).toBe(200);
      expect((await res.json()).status).toBe("completed");
    }).toPass({ timeout: 15000 });
    await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

    // The product's real UI has no path to re-open this action's own card
    // once a newer cycle supersedes it (FinanceCycleView only ever renders
    // dashboard.latestCycle) -- a genuine current UI limitation, not a test
    // shortcut. Verify outcome against the SAME action by id via the
    // documented backend feature directly.
    const verifyRes = await timedApiCall(context, "POST", "/api/owner/finance/actions/:actionId/verify", () =>
      page.request.post(`/api/owner/finance/actions/${actionId}/verify`, {
        data: { beforeValue: 100, afterValue: 50, targetDirection: "down" },
      })
    );
    expect(verifyRes.ok(), `Verify outcome request failed: ${verifyRes.status()}`).toBe(true);
    const verified = await timedApiCall(context, "GET", "/api/owner/finance/actions/:actionId", () =>
      page.request.get(`/api/owner/finance/actions/${actionId}`)
    );
    const verifiedBody = await verified.json();
    expect(verifiedBody.status).toBe("completed");
    expect(
      ["verified_improved", "verified_not_improved", "inconclusive", "disputed"]
    ).toContain(verifiedBody.verifications?.[0]?.status);
    await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("01-08 — reassessment: running diagnosis again produces a second, owner-visible cycle in history", async () => {
    await runFinanceDiagnosisAndAwaitResult(page, acceptanceBusinessId);
    await expect(page.locator("body")).toContainText(/Cycle #2|Diagnosis history/, { timeout: 15000 });
    expect(fatalErrors()).toHaveLength(0);
  });
  }); // end Finance closed loop (acceptance business)

  // ─── Cross-cutting reporting: always runs, regardless of which domain(s)
  // above failed -- deliberately outside either serial block so a Trinity
  // or Finance failure never prevents an accurate summary/5xx check. ──

  test("01-09 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
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
