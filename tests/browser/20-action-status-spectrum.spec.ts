/**
 * Flow 20 — ACTION-STATUS SPECTRUM (browser + mobile). Renders the runtime-fed SupervisorSummary panel for
 * businesses that resolve to EACH of the five owner action statuses, in a REAL browser, proving the whole
 * spectrum is reachable AND visually distinct end-to-end (§5):
 *
 *   safe_proceed     (healthy + SOP low)            → "Proceed"               (success)
 *   safe_cautious    (healthy + SOP medium)         → "Proceed with caution"  (warning)
 *   growth_scale     (healthy, NO SOP)              → "Owner decision required"(warning)
 *   safe_needs_data  (healthy + SOP, evidence gone) → "Need more data"         (muted)
 *   vendor_compliance(compliance boundary)          → "Blocked"               (destructive)
 *
 * Proves: proceed/cautious render only for the SOP-approved healthy businesses; the identical healthy
 * business WITHOUT a grant stays an owner decision; missing evidence and a compliance boundary never read as
 * "Proceed". All five distinct status labels appear in one session.
 *
 * Requires: scripts/seed-owner-scenarios.ts (loginable owner + scenario businesses incl. SAFE_ACTION_SCENARIOS).
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { scenarioBusinessId } from "../../src/services/owner-mode/owner-scenario-profiles";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}
async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

/** One business per status — profile, expected dominant, expected visible status label, canProceed. */
const SPECTRUM = [
  { profile: "safe_proceed", label: "low-risk SOP-approved action", dominant: "profitable_growth", status: "Proceed", canProceed: true, mobile: true },
  { profile: "safe_cautious", label: "medium-risk reversible SOP-approved action", dominant: "profitable_growth", status: "Proceed with caution", canProceed: true, mobile: false },
  { profile: "growth_scale", label: "healthy growth WITHOUT an SOP grant", dominant: "profitable_growth", status: "Owner decision required", canProceed: false, mobile: false },
  { profile: "safe_needs_data", label: "SOP-approved but evidence missing", dominant: "profitable_growth", status: "Need more data", canProceed: false, mobile: false },
  { profile: "vendor_compliance", label: "compliance boundary (must not proceed)", dominant: "compliance_block", status: "Blocked", canProceed: false, mobile: true },
] as const;

const MOBILE = SPECTRUM.filter((s) => s.mobile);

test.describe.configure({ mode: "serial" });

test.describe("20 — action-status spectrum (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  const seenStatuses = new Set<string>();

  for (const c of SPECTRUM) {
    test(`[${c.label}] renders "${c.status}" (${c.dominant})`, async () => {
      await selectBusiness(page, scenarioBusinessId(c.profile));
      const panel = page.locator('[data-testid="owner-supervisor-summary"]');
      await expect(panel).toBeVisible();
      await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText(c.dominant);

      const statusEl = panel.locator('[data-testid="supervisor-action-status"]');
      await expect(statusEl).toHaveText(c.status);
      seenStatuses.add(c.status);

      // proof + reassessment are surfaced even for proceed/cautious (no faked confidence).
      await expect(panel.locator('[data-testid="supervisor-proof"]')).toContainText(/proof/i);
      await expect(panel.locator('[data-testid="supervisor-reassessment"]')).toContainText(/reassess/i);

      // a non-proceeding business must never read as "Proceed" / "Proceed with caution".
      if (!c.canProceed) {
        const text = (await statusEl.innerText()).toLowerCase();
        expect(text).not.toBe("proceed");
        expect(text).not.toBe("proceed with caution");
      }
    });
  }

  test("all five distinct status labels were rendered in one session", () => {
    for (const s of ["Proceed", "Proceed with caution", "Owner decision required", "Need more data", "Blocked"]) {
      expect(seenStatuses.has(s), `status "${s}" rendered`).toBe(true);
    }
  });

  test("the SOP grant is the only lever: healthy proceed vs healthy owner-decision differ only by the grant", async () => {
    // Both businesses are `profitable_growth`, so the status badge itself (not the dominant constraint) is the
    // distinguishing signal — assert on it with a polling expectation so the panel has re-rendered post-switch.
    await selectBusiness(page, scenarioBusinessId("safe_proceed"));
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("profitable_growth");
    await expect(page.locator('[data-testid="supervisor-action-status"]')).toHaveText("Proceed");
    await selectBusiness(page, scenarioBusinessId("growth_scale"));
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("profitable_growth");
    await expect(page.locator('[data-testid="supervisor-action-status"]')).toHaveText("Owner decision required");
  });

  test("no fatal console errors across the spectrum", () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});

test.describe("20 — action-status spectrum (mobile 375×812)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  for (const c of MOBILE) {
    test(`[mobile] ${c.profile} shows "${c.status}" with no horizontal scroll`, async () => {
      await selectBusiness(page, scenarioBusinessId(c.profile));
      await expect(page.locator('[data-testid="owner-supervisor-summary"]')).toBeVisible();
      await expect(page.locator('[data-testid="supervisor-action-status"]')).toHaveText(c.status);
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, `horizontal overflow ${overflow}px`).toBeLessThanOrEqual(4);
    });
  }
});
