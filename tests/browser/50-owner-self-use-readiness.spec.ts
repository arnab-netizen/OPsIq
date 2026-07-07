/**
 * Flow 50 — owner SELF-USE readiness journey (browser, PASS 44).
 *
 * Hostile readiness proof that a real OWNER can safely self-use OpsIQ: log in, reach the canonical cockpit via
 * normal NAVIGATION (the sidebar link — not by typing an internal route), see one clear top action (or the
 * honest clean state) with its safety gates, drive a labelled action control (never window.prompt), keep the
 * recovery/outside sections collapsed, see no forbidden claim / PII / fake figure, and have the gate hold for
 * an unauthenticated visitor (redirect to /login — the URL cannot bypass the gate). The full approval/evidence/
 * reassessment/isolation/no-fabrication guarantees are proven by the DB simulations (PASS 42/43) + component
 * suites (PASS 40); this spec proves the owner-facing self-use journey in the real app.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

const FORBIDDEN: RegExp[] = [
  /guaranteed (recovery|profit|success)/,
  /predicted roi|projected (profit|roi)|win probability/,
  /auto-submit|automatically (submit|contact|spend|discount|contract)/,
  /\b(fire|sack|dismiss|discipline)\s+(the\s+)?(staff|employee|worker)/,
  /live internet intelligence|ai found this online|fully autonomous/,
  /[$£€]\s?\d/,
  /\bhidden score\b/,
];
const PII: RegExp[] = [/@[a-z0-9.-]+\.[a-z]{2,}/, /\b0?7\d{3}\s?\d{6}\b/];

test.describe.configure({ mode: "serial" });

test.describe("50 — owner self-use readiness (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.addInitScript(() => {
      window.prompt = () => { throw new Error("window.prompt is forbidden in the cockpit"); };
      window.alert = () => { throw new Error("window.alert is forbidden in the cockpit"); };
    });
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await waitForPageReady(page).catch(() => undefined);
  });
  test.afterAll(async () => { await context.close(); });

  test("the owner reaches the cockpit via the sidebar link (not by typing the cockpit route)", async () => {
    // After login the owner opens the Owner hub (/owner), whose sidebar exposes the canonical cockpit link.
    // (Restriction R6: the post-login /dashboard does not itself surface the owner section — see the readiness matrix.)
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page).catch(() => undefined);
    const link = page.locator('a[href="/owner/cockpit"]').first();
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.click();
    await waitForPageReady(page).catch(() => undefined);
    await expect(page).toHaveURL(/\/owner\/cockpit/);
  });

  test("the owner sees one top action (or the honest clean state) with its safety frame", async () => {
    const cockpit = page.locator('[data-testid="owner-cockpit"]');
    const clean = page.locator('[data-testid="cockpit-clean"]');
    await expect(cockpit.or(clean).first()).toBeVisible({ timeout: 15000 });
    expect((await cockpit.count()) + (await clean.count())).toBe(1);
    if (await cockpit.count()) {
      await expect(page.locator('[data-testid="cockpit-top-action-title"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="cockpit-why"]')).toBeVisible();
      await expect(page.locator('[data-testid="cockpit-owner-decision"]')).toBeVisible();
      await expect(page.locator('[data-testid="cockpit-blocked"]')).toBeVisible();
    }
  });

  test("action controls are labelled (never window.prompt) where the top action is interactive", async () => {
    if (!(await page.locator('[data-testid="cockpit-safe-actions"]').count())) {
      test.skip(true, "top action is terminal/monitor-only/blocked — no interactive controls here");
      return;
    }
    const reject = page.locator('[data-testid="cockpit-action-REJECT"]');
    if (!(await reject.count())) { test.skip(true, "REJECT not offered for this route"); return; }
    await reject.click();
    await expect(page.locator('[data-testid="cockpit-action-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="cockpit-reason-input"]')).toBeVisible();
    await page.locator('[data-testid="cockpit-cancel"]').click();
    expect(fatalErrors()).toEqual([]);
  });

  test("recovery + outside sections stay collapsed; no forbidden claim / PII anywhere", async () => {
    if (!(await page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').count())) return;
    for (const id of ["cockpit-recovery-group", "cockpit-signals-group"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      if (!(await el.count())) continue;
      expect(await el.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false);
      await el.locator("summary").click().catch(() => undefined);
    }
    for (const id of ["cockpit-secondary-group", "cockpit-monitor-group", "cockpit-proof-drawer"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      if (await el.count()) await el.locator("summary").click().catch(() => undefined);
    }
    const root = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').first();
    const text = (await root.innerText()).toLowerCase();
    for (const re of FORBIDDEN) expect(text, `forbidden copy matched ${re}`).not.toMatch(re);
    for (const re of PII) expect(text, `PII matched ${re}`).not.toMatch(re);
    expect(text).not.toMatch(/\b(fraud|negligent|negligence|lazy|dishonest)\b/);
    expect(fatalErrors()).toEqual([]);
  });

  test("the gate cannot be bypassed: an unauthenticated visitor is redirected to /login", async ({ browser }) => {
    const anon = await browser.newContext(); // no session
    const anonPage = await anon.newPage();
    try {
      await anonPage.goto("/owner/cockpit", { waitUntil: "networkidle" });
      await expect(anonPage).toHaveURL(/\/login/);
      const resp = await anonPage.request.get("/api/owner/now-view");
      expect(resp.status()).not.toBe(200);
    } finally {
      await anon.close();
    }
  });
});
