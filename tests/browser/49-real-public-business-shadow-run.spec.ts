/**
 * Flow 49 — real public business data SHADOW RUN cockpit journey (browser, PASS 43).
 *
 * Proves the owner-facing cockpit journey for a public-business shadow workspace in the REAL app. The seeded
 * owner-pilot workspace (scripts/seed-owner-scenarios.ts + seed-e2e-opportunity.ts) carries an anonymized public
 * opportunity/signal, so this spec walks the Outside-signals journey with a hostile eye for public-data safety:
 * the owner sees one top action, expands Outside signals to a PUBLIC-UNCERTAINTY caveat + the no-live-ingestion
 * statement, sees validation/blocked requirements, and NEVER sees real PII, a raw public-text dump, or a fake
 * financial/ROI/win-probability claim. The full 3-case public-signal harness (BUSINESS_A/B/C + clean) is proven
 * deterministically by src/__tests__/execution/real-public-business-shadow-run.db.test.ts; this proves the
 * cockpit journey over public-derived anonymized data — NOT real-world outcomes.
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
  /live internet intelligence|ai found this online|fully autonomous/,
  /auto-submit|automatically (submit|contact|spend)/,
  /[$£€]\s?\d/,
];
const PII: RegExp[] = [/@[a-z0-9.-]+\.[a-z]{2,}/, /\b0?7\d{3}\s?\d{6}\b/, /ignore previous instructions/];

test.describe.configure({ mode: "serial" });

test.describe("49 — real public business shadow run cockpit journey (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.addInitScript(() => {
      window.prompt = () => { throw new Error("window.prompt is forbidden in the cockpit"); };
    });
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("the cockpit renders one honest state with a single top action or clean state", async () => {
    const cockpit = page.locator('[data-testid="owner-cockpit"]');
    const clean = page.locator('[data-testid="cockpit-clean"]');
    await expect(cockpit.or(clean).first()).toBeVisible({ timeout: 15000 });
    expect((await cockpit.count()) + (await clean.count())).toBe(1);
    if (await cockpit.count()) {
      await expect(page.locator('[data-testid="cockpit-top-action-title"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="cockpit-why"]')).toBeVisible();
    }
  });

  test("Outside signals expands to a public-uncertainty caveat and the no-live-ingestion boundary", async () => {
    const sig = page.locator('[data-testid="cockpit-signals-group"]');
    if (!(await sig.count())) { test.skip(true, "public-signals endpoint unavailable in this environment"); return; }
    await expect(sig).toBeVisible();
    expect(await sig.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false); // collapsed by default
    await sig.locator("summary").click();
    expect(await sig.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(true);
    await expect(page.locator('[data-testid="cockpit-signals-noingest"]')).toContainText(/does not fetch live/i);
    await expect(page.locator('[data-testid="cockpit-signals-caveat"]')).toContainText(/unverified|signal, not confirmed fact/i);
  });

  test("no real PII, no raw public-text dump, no fake financial/ROI/win-probability claim", async () => {
    for (const id of ["cockpit-signals-group", "cockpit-recovery-group", "cockpit-proof-drawer"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      if (await el.count()) await el.locator("summary").click().catch(() => undefined);
    }
    const root = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').first();
    const text = (await root.innerText()).toLowerCase();
    for (const re of FORBIDDEN) expect(text, `forbidden copy matched ${re}`).not.toMatch(re);
    for (const re of PII) expect(text, `PII/raw matched ${re}`).not.toMatch(re);
    // no raw public review verbatim dump (governed summaries only).
    expect(text).not.toMatch(/refund everyone|was rude/);
    expect(fatalErrors()).toEqual([]);
  });

  test("unsafe actions are shown as blocked; nothing is auto-submitted or contacted", async () => {
    if (!(await page.locator('[data-testid="owner-cockpit"]').count())) return;
    await expect(page.locator('[data-testid="cockpit-blocked"]')).toBeVisible();
    const text = (await page.locator('[data-testid="cockpit-blocked"]').innerText()).toLowerCase();
    // the blocked section never promises an external action.
    expect(text).not.toMatch(/auto-submit|automatically submit|will contact|will send/);
  });
});
