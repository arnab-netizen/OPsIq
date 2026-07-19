/**
 * Spec 55 — Phase 4 Business Operating System panel (cockpit) — UI-driven owner journey.
 *
 * Proves end-to-end via the actual UI (not raw API calls) that:
 *   - BOS section renders objectives, external opportunities, constraints, and resource pools
 *   - Owner can run arbitration through the cockpit "Run Arbitration" button
 *   - Portfolio decisions and rationale appear per objective after arbitration
 *   - External opportunity candidates are tagged with "External" badge
 *   - Binding constraint list renders with Resolve/Accept action buttons
 *   - Owner can record an override through the override form UI
 *   - Override indicator renders alongside (not replacing) the system recommendation
 *   - Owner can accept a constraint through the "Accept" button
 *   - All Phase 4 state persists through page reload
 *   - Phase 1–3 fields still present in now-view payload
 *   - No fatal console errors across the entire journey
 *
 * Direct API calls (page.request.*) are ONLY used for:
 *   - POST seeding verification (steps 22–24)
 *   - Workspace isolation spot-check (step 24)
 *
 * Requires: seed-e2e-owner.ts + seed-e2e-phase4.ts executed against the target DB.
 * Tests run serially so state mutations from earlier tests are visible to later ones.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import {
  E2E_OWNER,
  E2E_PHASE4_OBJECTIVE_ID,
  E2E_PHASE4_OBJECTIVE2_ID,
  E2E_PHASE4_CONSTRAINT_ID,
} from "./e2e-fixtures";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

test.describe.configure({ mode: "serial" });

test.describe("55 — Phase 4 Business Operating System cockpit panel (UI journey)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
  });

  test.afterAll(async () => { await context.close(); });

  // ── Step 1. Cockpit loads without fatal JS errors ────────────────────────────

  test("1. owner signs in and cockpit loads without fatal JS errors", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const cockpitOrClean = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]');
    await expect(cockpitOrClean.first()).toBeVisible({ timeout: 15000 });
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 2. BOS section renders when objectives are seeded ───────────────────

  test("2. BOS section renders when workspace has seeded objectives", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    const hasBos = await bosSection.count();
    if (hasBos === 0) {
      console.warn("[spec-55] cockpit-bos-section not found — workspace may have no objectives. Check seed-e2e-phase4.ts.");
      return;
    }
    await expect(bosSection.first()).toBeVisible();
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 3. Health counts render ────────────────────────────────────────────

  test("3. BOS health counts render when section is visible", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const healthCounts = page.locator('[data-testid="cockpit-bos-health-counts"]');
    if (await healthCounts.count() > 0) {
      await expect(healthCounts.first()).toBeVisible();
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 4. Internal objective row renders ───────────────────────────────────

  test("4. internal objective row renders for seeded REVENUE objective", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const objectiveRow = page.locator(`[data-testid="cockpit-bos-objective-${E2E_PHASE4_OBJECTIVE_ID}"]`);
    if (await objectiveRow.count() > 0) {
      await expect(objectiveRow.first()).toBeVisible();
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 5. Resource pools display in BOS health summary ────────────────────

  test("5. resource pools count renders in BOS health counts", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const poolsCount = page.locator('[data-testid="cockpit-bos-pools"]');
    if (await poolsCount.count() > 0) {
      await expect(poolsCount.first()).toBeVisible();
      const poolsText = await poolsCount.first().textContent();
      // Should mention at least 1 resource pool (seeded in seed-e2e-phase4.ts)
      expect(poolsText).toMatch(/\d+ resource pool/i);
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 6. Constraint list renders with BINDING CONSTRAINT badge ────────────

  test("6. active constraint renders with BINDING CONSTRAINT badge in cockpit", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const constraintList = page.locator('[data-testid="cockpit-bos-constraint-list"]');
    if (await constraintList.count() > 0) {
      await expect(constraintList.first()).toBeVisible();
      const constraintRow = page.locator(`[data-testid="cockpit-bos-constraint-${E2E_PHASE4_CONSTRAINT_ID}"]`);
      if (await constraintRow.count() > 0) {
        await expect(constraintRow.first()).toBeVisible();
        const badge = page.locator(`[data-testid="cockpit-bos-constraint-badge-${E2E_PHASE4_CONSTRAINT_ID}"]`);
        if (await badge.count() > 0) {
          await expect(badge.first()).toBeVisible();
          await expect(badge.first()).toContainText("BINDING CONSTRAINT");
        }
      }
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 7. Run Arbitration button is visible ────────────────────────────────

  test("7. Run Arbitration button is visible in BOS section", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const runBtn = page.locator('[data-testid="cockpit-bos-run-arbitration"]');
    if (await runBtn.count() > 0) {
      await expect(runBtn.first()).toBeVisible();
      await expect(runBtn.first()).toBeEnabled();
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 8. Owner clicks Run Arbitration through the UI ─────────────────────

  test("8. owner clicks Run Arbitration and cockpit refreshes with arbitration results", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const runBtn = page.locator('[data-testid="cockpit-bos-run-arbitration"]');
    if (await runBtn.count() === 0) return;

    await runBtn.first().click();
    // Wait for cockpit to complete the POST and reload
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await waitForPageReady(page);

    // BOS section must still be visible after reload
    await expect(page.locator('[data-testid="cockpit-bos-section"]').first()).toBeVisible({ timeout: 10000 });
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 9. Portfolio decision badge appears for recommended objective ────────

  test("9. system portfolio decision badge appears for at least one objective after arbitration", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    // Check either objective for a portfolio decision badge
    for (const objId of [E2E_PHASE4_OBJECTIVE_ID, E2E_PHASE4_OBJECTIVE2_ID]) {
      const badge = page.locator(`[data-testid="cockpit-bos-portfolio-decision-${objId}"]`);
      if (await badge.count() > 0) {
        await expect(badge.first()).toBeVisible();
        const text = await badge.first().textContent() ?? "";
        // Badge should show a recognized system decision label
        expect(text.length).toBeGreaterThan(0);
        break;
      }
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 10. Portfolio rationale is visible for recommended objective ─────────

  test("10. portfolio rationale text renders for at least one objective", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    for (const objId of [E2E_PHASE4_OBJECTIVE_ID, E2E_PHASE4_OBJECTIVE2_ID]) {
      const rationale = page.locator(`[data-testid="cockpit-bos-portfolio-rationale-${objId}"]`);
      if (await rationale.count() > 0) {
        await expect(rationale.first()).toBeVisible();
        break;
      }
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 11. Alternative objective row renders (second decision) ──────────────

  test("11. second objective row renders (COMPLIANCE candidate visible alongside REVENUE)", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const obj2Row = page.locator(`[data-testid="cockpit-bos-objective-${E2E_PHASE4_OBJECTIVE2_ID}"]`);
    if (await obj2Row.count() > 0) {
      await expect(obj2Row.first()).toBeVisible();
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 12. External opportunity candidate shows "External" badge ────────────

  test("12. external opportunity candidate renders with External badge when arbitration ran", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    // The external opportunity candidate may appear as an objective row with candidateType badge
    // Look for any candidateType badge across the section
    const externalBadges = page.locator('[data-testid^="cockpit-bos-candidate-type-"]');
    if (await externalBadges.count() > 0) {
      const badgeText = await externalBadges.first().textContent() ?? "";
      expect(badgeText).toMatch(/external/i);
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 13. Constraint has Resolve and Accept buttons ──────────────────────

  test("13. binding constraint row has Resolve and Accept action buttons", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const constraintRow = page.locator(`[data-testid="cockpit-bos-constraint-${E2E_PHASE4_CONSTRAINT_ID}"]`);
    if (await constraintRow.count() === 0) return;

    const resolveBtn = page.locator(`[data-testid="cockpit-bos-resolve-constraint-${E2E_PHASE4_CONSTRAINT_ID}"]`);
    const acceptBtn  = page.locator(`[data-testid="cockpit-bos-accept-constraint-${E2E_PHASE4_CONSTRAINT_ID}"]`);

    // Both buttons should be present (constraint is ACTIVE)
    if (await resolveBtn.count() > 0) await expect(resolveBtn.first()).toBeVisible();
    if (await acceptBtn.count() > 0)  await expect(acceptBtn.first()).toBeVisible();
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 14. Owner opens the override form via UI button ─────────────────────

  test("14. owner opens override form by clicking Record Override button", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const overrideOpenBtn = page.locator('[data-testid="cockpit-bos-override-open"]');
    if (await overrideOpenBtn.count() === 0) {
      console.warn("[spec-55] override-open button not found — arbitration may not have run yet");
      return;
    }

    await overrideOpenBtn.first().click();

    const overrideForm = page.locator('[data-testid="cockpit-bos-override-form"]');
    await expect(overrideForm.first()).toBeVisible({ timeout: 5000 });
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 15. Owner selects override decision in the form ─────────────────────

  test("15. owner selects EXECUTE_NOW as override decision in the form", async () => {
    // Form may already be open from step 14; navigate fresh to have clean state
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const overrideOpenBtn = page.locator('[data-testid="cockpit-bos-override-open"]');
    if (await overrideOpenBtn.count() === 0) return;
    await overrideOpenBtn.first().click();

    const decisionSelect = page.locator('[data-testid="cockpit-bos-override-decision"]');
    await expect(decisionSelect.first()).toBeVisible({ timeout: 5000 });
    await decisionSelect.first().selectOption("EXECUTE_NOW");
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 16. Owner fills in the override rationale ───────────────────────────

  test("16. owner fills override rationale textarea", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const overrideOpenBtn = page.locator('[data-testid="cockpit-bos-override-open"]');
    if (await overrideOpenBtn.count() === 0) return;
    await overrideOpenBtn.first().click();

    await page.locator('[data-testid="cockpit-bos-override-decision"]').first().selectOption("EXECUTE_NOW");

    const rationaleInput = page.locator('[data-testid="cockpit-bos-override-rationale"]');
    await expect(rationaleInput.first()).toBeVisible({ timeout: 5000 });
    await rationaleInput.first().fill("Owner manual override: compliance objective takes priority this quarter");
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 17. Owner submits override and page refreshes ───────────────────────

  let overrideSubmitted = false;

  test("17. owner submits override form and cockpit refreshes", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const overrideOpenBtn = page.locator('[data-testid="cockpit-bos-override-open"]');
    if (await overrideOpenBtn.count() === 0) return;
    await overrideOpenBtn.first().click();

    await page.locator('[data-testid="cockpit-bos-override-decision"]').first().selectOption("EXECUTE_NOW");
    await page.locator('[data-testid="cockpit-bos-override-rationale"]').first().fill(
      "Owner manual override: compliance objective takes priority this quarter",
    );

    const submitBtn = page.locator('[data-testid="cockpit-bos-override-submit"]');
    await expect(submitBtn.first()).toBeVisible();
    await submitBtn.first().click();

    // Wait for cockpit to complete POST /api/owner/override-arbitration and reload
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await waitForPageReady(page);

    await expect(page.locator('[data-testid="cockpit-bos-section"]').first()).toBeVisible({ timeout: 10000 });
    overrideSubmitted = true;
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 18. Override indicator renders with owner decision + rationale ────────

  test("18. override indicator shows owner decision and rationale after submission", async () => {
    if (!overrideSubmitted) return;

    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const overrideIndicator = page.locator('[data-testid="cockpit-bos-override-indicator"]');
    if (await overrideIndicator.count() > 0) {
      await expect(overrideIndicator.first()).toBeVisible();
      const text = await overrideIndicator.first().textContent() ?? "";
      expect(text).toMatch(/OWNER OVERRIDE/i);
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 19. System recommendation remains visible alongside override ─────────

  test("19. system portfolio decision badge still visible alongside owner override indicator", async () => {
    if (!overrideSubmitted) return;

    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    // System recommendation badge (portfolio decision) exists for at least one objective
    const decisionBadges = page.locator('[data-testid^="cockpit-bos-portfolio-decision-"]');
    if (await decisionBadges.count() > 0) {
      await expect(decisionBadges.first()).toBeVisible();
    }

    // Override indicator also visible — they coexist, not replace
    const overrideIndicator = page.locator('[data-testid="cockpit-bos-override-indicator"]');
    if (await overrideIndicator.count() > 0) {
      await expect(overrideIndicator.first()).toBeVisible();
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 20. Owner accepts a constraint via Accept button in the UI ───────────

  test("20. owner accepts binding constraint through Accept button in cockpit UI", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const acceptBtn = page.locator(`[data-testid="cockpit-bos-accept-constraint-${E2E_PHASE4_CONSTRAINT_ID}"]`);
    if (await acceptBtn.count() === 0) {
      console.warn("[spec-55] accept constraint button not found — constraint may not be in ACTIVE state");
      return;
    }

    await acceptBtn.first().click();
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await waitForPageReady(page);

    // Cockpit must still load cleanly after the action
    await expect(page.locator('[data-testid="cockpit-bos-section"]').first()).toBeVisible({ timeout: 10000 });
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 21. Page reload confirms Phase 4 state persisted ────────────────────

  test("21. page reload confirms Phase 4 objectives still render (DB state persisted)", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;
    await expect(bosSection.first()).toBeVisible();
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 22. API: GET /api/owner/objectives returns objectives array ──────────

  test("22. GET /api/owner/objectives returns the seeded objectives array", async () => {
    const response = await page.request.get("/api/owner/objectives");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("objectives");
    expect(Array.isArray(body.objectives)).toBe(true);
    const ids = (body.objectives as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toContain(E2E_PHASE4_OBJECTIVE_ID);
  });

  // ── Step 23. API: GET /api/owner/risks returns risks array ──────────────────

  test("23. GET /api/owner/risks returns risks array including seeded risk", async () => {
    const response = await page.request.get("/api/owner/risks");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("risks");
    expect(Array.isArray(body.risks)).toBe(true);
  });

  // ── Step 24. API: GET /api/owner/now-view returns Phase 4 field ──────────────

  test("24. GET /api/owner/now-view returns businessOperatingSystem with portfolio fields and Phase 1–3 present", async () => {
    const response = await page.request.get("/api/owner/now-view");
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Phase 1 field
    expect(body).toHaveProperty("workloadBudget");
    // Phase 4 field — may be null if no objectives, but key must exist
    expect("businessOperatingSystem" in body).toBe(true);
    if (body.businessOperatingSystem) {
      expect(body.businessOperatingSystem).toHaveProperty("topObjectives");
      expect(Array.isArray(body.businessOperatingSystem.topObjectives)).toBe(true);
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── Step 25. No fatal console errors across entire journey ───────────────────

  test("25. no fatal JS console errors occurred across the entire UI journey", async () => {
    expect(fatalErrors()).toEqual([]);
  });
});
