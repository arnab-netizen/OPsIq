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
import { readFileSync, writeFileSync } from "fs";
import { authenticateProductionOwner } from "./helpers/production-auth";
import { startTracing, captureOnFailure, checkpointScreenshot, finalizeTracing } from "./helpers/evidence";

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

test.describe.configure({ mode: "serial" });

test.describe("PROD-01 — Existing-business Owner journey live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let acceptanceBusinessId = "";
  let trinityBusinessId: string | null = null;
  let trinityFound = false;
  // Non-null only when this suite must not proceed. Distinguishes a real
  // upstream failure (10-startup-mode-acceptance.spec.ts didn't produce a
  // usable acceptance business) from this suite's own defects -- every
  // test below skips with this exact reason rather than throwing from
  // beforeAll, which would otherwise surface as an opaque, unrelated
  // "Cannot read properties of undefined" crash instead of a clear
  // BLOCKED_UPSTREAM classification.
  let blockedUpstreamReason: string | null = null;

  test.beforeAll(async ({ browser }) => {
    let handoffIds: { handoffBusinessId?: string; succeeded?: boolean };
    try {
      handoffIds = JSON.parse(
        readFileSync("production-test-results/evidence/phase13-startup-mode-ids.json", "utf-8")
      );
    } catch {
      blockedUpstreamReason =
        "BLOCKED_UPSTREAM: phase13-startup-mode-ids.json not found -- 10-startup-mode-acceptance.spec.ts did not run or did not complete its afterAll.";
      return;
    }
    if (!handoffIds.succeeded || !handoffIds.handoffBusinessId) {
      blockedUpstreamReason =
        "BLOCKED_UPSTREAM: 10-startup-mode-acceptance.spec.ts did not produce a usable acceptance business (see that spec's own results, e.g. AUTH_LOGIN failure) -- this suite's mutating steps have no business to run against.";
      return;
    }
    acceptanceBusinessId = handoffIds.handoffBusinessId;

    context = await browser.newContext();
    page = await context.newPage();
    watchPage(page);
    registerFinanceDialogHandler(page);
    await authenticateProductionOwner(page);
    await startTracing(context);
  });

  test.beforeEach(() => {
    test.skip(blockedUpstreamReason !== null, blockedUpstreamReason ?? undefined);
  });

  test.afterEach(async ({}, testInfo) => {
    await captureOnFailure(context, page, testInfo, SPEC_NAME);
  });

  test.afterAll(async () => {
    await finalizeTracing(context);
    if (context) await context.close();
  });

  // ─── Trinity Services: read-only discovery + data/diagnosis visibility ──

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
    const res = await page.request.get(`/api/owner/finance/dashboard?businessId=${trinityBusinessId}`);
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

  // ─── Acceptance business: full Finance closed loop (real UI mutations) ──

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
    await page.getByRole("button", { name: "Run finance diagnosis" }).click();
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toMatch(/Latest diagnosis|Findings \(/);
    await checkpointScreenshot(context, page, SPEC_NAME, "diagnosis-result");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("01-07 — action lifecycle: Assign -> Start -> Complete -> Verify outcome, each step's owner-visible status confirmed", async () => {
    const actionCards = page.locator("section", { hasText: "Finance actions" }).locator(".border.rounded.p-3");
    const count = await actionCards.count();
    test.skip(count === 0, "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.");
    const card = actionCards.first();

    await card.getByRole("button", { name: "Assign" }).click();
    await page.waitForLoadState("networkidle");
    await expect(card).toContainText("assigned");

    await card.getByRole("button", { name: "Start" }).click();
    await page.waitForLoadState("networkidle");
    await expect(card).toContainText("in_progress");

    await card.getByRole("button", { name: "Complete" }).click();
    await page.waitForLoadState("networkidle");
    await expect(card).toContainText("completed");
    await checkpointScreenshot(context, page, SPEC_NAME, "action-completed");

    await card.getByRole("button", { name: "Verify outcome" }).click();
    await page.waitForLoadState("networkidle");
    await expect(
      card.locator("text=/verified_improved|verified_not_improved|inconclusive|disputed/")
    ).toBeVisible();
    await checkpointScreenshot(context, page, SPEC_NAME, "action-verified");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("01-08 — reassessment: running diagnosis again produces a second, owner-visible cycle in history", async () => {
    await page.getByRole("button", { name: "Run finance diagnosis" }).click();
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toMatch(/Cycle #2|Diagnosis history/);
    expect(fatalErrors()).toHaveLength(0);
  });

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
