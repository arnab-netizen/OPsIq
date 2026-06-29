/**
 * Flow F — Legacy UI safety: the mock governance page is unreachable.
 *
 * The legacy /decisions/[id] page once rendered approve/reject/override controls over hardcoded
 * MOCK data with an empty audit trail (GAP-UI-01). It now redirects to the canonical, secured
 * decision surface, so no fabricated governance surface is reachable from the browser.
 *
 * Documented (not browser-tested) in OPSIQ_PLAYWRIGHT_MAX_OWNER_FLOW_REPORT.md: GAP-UI-03 (the old
 * 404 /success|/failure outcome paths now call record-outcome/fail) and override-reason preservation
 * (the budget override flow records the reason as an audited event). Neither is faked here.
 */
import { test, expect } from "@playwright/test";
import { authenticateUser } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

test.describe("F — Legacy UI safety", () => {
  test("the legacy mock governance page redirects away to the canonical surface", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);

    await page.goto("/decisions/00000000-0000-0000-0000-0000000000ff", { waitUntil: "networkidle" });

    // The mock /decisions/[id] route must not render — it redirects to the canonical decision surface.
    expect(page.url()).not.toContain("/decisions/");
    await expect(page).toHaveURL(/\/dashboard\/decision\//);
  });
});
