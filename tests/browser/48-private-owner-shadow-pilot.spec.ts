/**
 * Flow 48 — private owner SHADOW PILOT cockpit journey (browser, PASS 42).
 *
 * Runs the owner shadow-pilot journey through the REAL app against the seeded owner-pilot workspace, which is
 * itself an OWNER_STYLE_SYNTHETIC_SHADOW_FIXTURE set (anonymized laundry/local-service scenarios — see
 * scripts/seed-owner-scenarios.ts + seed-e2e-owner-pilot.ts + seed-e2e-proof-risk.ts + seed-e2e-opportunity.ts).
 * It proves the owner can walk the governed decision loop at /owner/cockpit safely: one top action with its
 * why / owner-decision / evidence / reassessment frame, recovery + outside-signals available read-only and
 * collapsed, unsafe actions blocked, labelled action controls (never window.prompt), and NO forbidden claim,
 * raw sensitive data, or PII on screen. The full 8-scenario harness (A–H) is proven deterministically by the
 * DB simulation src/__tests__/execution/private-owner-shadow-pilot-pack.db.test.ts; this spec proves the
 * owner-facing cockpit journey over synthetic owner-style data — NOT real owner business outcomes.
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

/** Forbidden claims — written so they cannot match the cockpit's SAFE negated copy. */
const FORBIDDEN: RegExp[] = [
  /guaranteed (recovery|profit|success|survival)/,
  /predicted roi|projected (profit|roi)|win probability/,
  /auto-submit|auto-contact|automatically (submit|contact|spend|discount|contract)/,
  /\b(fire|sack|dismiss|discipline)\s+(the\s+)?(staff|employee|worker)/,
  /live internet intelligence|ai found this online|fully autonomous/,
  /[$£€]\s?\d/,
  /\bhidden score\b/,
];
/** Raw sensitive data / PII that must never render. */
const PII: RegExp[] = [/@[a-z0-9.-]+\.[a-z]{2,}/, /\b0?7\d{3}\s?\d{6}\b/, /ignore previous instructions/];

async function cockpitText(page: Page): Promise<string> {
  const root = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').first();
  return (await root.innerText()).toLowerCase();
}

test.describe.configure({ mode: "serial" });

test.describe("48 — private owner shadow pilot cockpit journey (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.addInitScript(() => {
      window.prompt = () => { throw new Error("window.prompt is forbidden in the shadow-pilot cockpit"); };
      window.alert = () => { throw new Error("window.alert is forbidden in the shadow-pilot cockpit"); };
    });
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("the shadow workspace renders exactly one honest cockpit state", async () => {
    const cockpit = page.locator('[data-testid="owner-cockpit"]');
    const clean = page.locator('[data-testid="cockpit-clean"]');
    await expect(cockpit.or(clean).first()).toBeVisible({ timeout: 15000 });
    expect((await cockpit.count()) + (await clean.count())).toBe(1);
  });

  test("one top action with why / owner-decision / evidence / reassessment", async () => {
    if (!(await page.locator('[data-testid="owner-cockpit"]').count())) {
      test.skip(true, "clean state — the governed journey is proven by the DB simulation");
      return;
    }
    await expect(page.locator('[data-testid="cockpit-top-action-title"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="cockpit-why"]')).toBeVisible();
    await expect(page.locator('[data-testid="cockpit-owner-decision"]')).toBeVisible();
    await expect(page.locator('[data-testid="cockpit-reassessment"]')).toContainText(/reassessment/i);
    // unsafe / not-allowed section is present (OpsIQ never takes an external action).
    await expect(page.locator('[data-testid="cockpit-blocked"]')).toBeVisible();
  });

  test("recovery status + outside signals are available read-only and collapsed by default", async () => {
    if (!(await page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').count())) return;
    for (const id of ["cockpit-recovery-group", "cockpit-signals-group"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      if (!(await el.count())) continue; // tolerate an environment where the read endpoint is unavailable
      await expect(el).toBeVisible();
      expect(await el.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false);
      await el.locator("summary").click();
      expect(await el.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(true);
    }
    const recovery = page.locator('[data-testid="cockpit-recovery-caveat"]');
    if (await recovery.count()) await expect(recovery).toContainText(/not guaranteed/i);
    const noingest = page.locator('[data-testid="cockpit-signals-noingest"]');
    if (await noingest.count()) await expect(noingest).toContainText(/does not fetch live/i);
  });

  test("action controls are labelled (never window.prompt) where the top action is interactive", async () => {
    if (!(await page.locator('[data-testid="cockpit-safe-actions"]').count())) {
      test.skip(true, "top action is terminal/monitor-only/blocked — no interactive controls here");
      return;
    }
    const reason = page.locator('[data-testid="cockpit-action-REJECT"]');
    if (!(await reason.count())) { test.skip(true, "REJECT not offered for this route"); return; }
    await reason.click();
    await expect(page.locator('[data-testid="cockpit-action-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="cockpit-reason-input"]')).toBeVisible();
    await page.locator('[data-testid="cockpit-cancel"]').click();
    expect(fatalErrors()).toEqual([]);
  });

  test("no forbidden claim, no raw sensitive data, no PII anywhere in the cockpit", async () => {
    for (const id of ["cockpit-secondary-group", "cockpit-monitor-group", "cockpit-proof-drawer", "cockpit-recovery-group", "cockpit-signals-group"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      if (await el.count()) await el.locator("summary").click().catch(() => undefined);
    }
    const text = await cockpitText(page);
    for (const re of FORBIDDEN) expect(text, `forbidden copy matched ${re}`).not.toMatch(re);
    for (const re of PII) expect(text, `sensitive data matched ${re}`).not.toMatch(re);
    expect(text).not.toMatch(/\b(fraud|theft|negligent|negligence|lazy|dishonest)\b/);
    expect(fatalErrors()).toEqual([]);
  });
});
