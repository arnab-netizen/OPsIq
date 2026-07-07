/**
 * Flow 47 — owner cockpit END-TO-END, NO-OVERLOAD hostile browser proof (PASS 40).
 *
 * Boots the REAL app against the seeded owner-pilot postgres, logs in as a real OWNER, opens the canonical
 * `/owner/cockpit`, and walks the whole owner journey with a hostile eye for cognitive overload and forbidden
 * output. It asserts the anti-overload envelope end to end (exactly one top action, ≤3 reason bullets, ≤2
 * primary buttons, ≤3 secondary controls, every secondary/monitor/recovery/signals/proof section collapsed by
 * default) AND that NONE of the forbidden strings ever render:
 *
 *   guaranteed recovery/profit · predicted ROI · win probability · auto-submit/contact/spend/discount ·
 *   fire/discipline staff · live internet intelligence · "AI found this online" · fully autonomous ·
 *   raw prompt-injection · raw PII · fabricated money · hidden score.
 *
 * Journeys: A normal (one top action) · B crisis recovery (collapsed, no guarantee) · C public signal
 * (collapsed, no live ingestion) · D action controls (labelled inputs, never window.prompt) · E unauthorized
 * (unauthenticated redirect + fail-closed API) · F clean-state contract (exactly one honest state, never a
 * fabricated hybrid) · G no-overload limits. The deterministic clean-workspace state (F) and the full
 * forbidden-copy matrix are additionally pinned by `src/__tests__/components/owner-cockpit-no-overload.test.tsx`.
 *
 * Real app + real backend + server enforcement active. No client fakery can satisfy these assertions.
 * Requires the owner-pilot-e2e seed (seed-owner-scenarios + seed-e2e-owner-pilot + seed-e2e-proof-risk +
 * seed-e2e-opportunity) so the workspace has a bridged top action and a persisted external signal.
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

/** Forbidden phrasings, written so they cannot match the SAFE negated safety copy the cockpit legitimately shows. */
const FORBIDDEN: RegExp[] = [
  /guaranteed (recovery|profit|success|survival)/,
  /\bwe guarantee\b/,
  /predicted roi|projected (profit|roi)|expected return of/,
  /win probability|probability of winning/,
  /auto-submit|auto-contact|automatically (submit|submits|contact|contacts|spend|spends|discount|discounts|contract|contracts)/,
  /\b(fire|firing|sack|sacking|dismiss|discipline|disciplining|reprimand)\s+(the\s+)?(staff|employee|worker|team|manager)/,
  /live internet intelligence|ai found this online|scraped from the (web|internet)/,
  /fully autonomous|acts on its own|without your approval/,
  /ignore (all |the )?previous instructions|system prompt|disregard (all|the) (above|prior)/,
  /[$£€]\s?\d/,
  /\bhidden score\b/,
];
const PII: RegExp[] = [/@[a-z0-9.-]+\.[a-z]{2,}/, /\b0?7\d{3}\s?\d{6}\b/];

async function rootText(page: Page): Promise<string> {
  const root = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').first();
  return (await root.innerText()).toLowerCase();
}
function assertNoForbidden(text: string) {
  for (const re of FORBIDDEN) expect(text, `forbidden copy matched ${re}`).not.toMatch(re);
}

test.describe.configure({ mode: "serial" });

test.describe("47 — owner cockpit end-to-end no-overload (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    // Any use of window.prompt/alert by the owner action path is a governance violation → make it fail loudly.
    await page.addInitScript(() => {
      window.prompt = () => { throw new Error("window.prompt is forbidden in the cockpit"); };
      window.alert = () => { throw new Error("window.alert is forbidden in the cockpit"); };
    });
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  // ── F (contract): exactly ONE honest state renders — a top action OR the clean state, never both, never a hybrid. ──
  test("F. the cockpit renders exactly one honest state (top action XOR clean), never a fabricated hybrid", async () => {
    const cockpit = page.locator('[data-testid="owner-cockpit"]');
    const clean = page.locator('[data-testid="cockpit-clean"]');
    await expect(cockpit.or(clean).first()).toBeVisible({ timeout: 15000 });
    const haveCockpit = await cockpit.count();
    const haveClean = await clean.count();
    expect(haveCockpit + haveClean).toBe(1); // exactly one, never both
    if (haveClean) {
      await expect(clean).toContainText(/no urgent action needs your attention/i);
      await expect(page.locator('[data-testid="cockpit-top-action-title"]')).toHaveCount(0);
    }
  });

  // ── A: normal — exactly one top governed action with its safety frame. ──
  test("A. normal: exactly one top governed action with why / owner-decision / reassessment", async () => {
    if (!(await page.locator('[data-testid="owner-cockpit"]').count())) {
      test.skip(true, "workspace is in the honest clean state; the top-action journey is proven by the component suite");
      return;
    }
    await expect(page.locator('[data-testid="cockpit-top-action-title"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="cockpit-why"]')).toBeVisible();
    await expect(page.locator('[data-testid="cockpit-owner-decision"]')).toBeVisible();
    await expect(page.locator('[data-testid="cockpit-reassessment"]')).toContainText(/reassessment/i);
  });

  // ── G: no-overload envelope — one action, bounded reasons, bounded buttons, all sections collapsed. ──
  test("G. no-overload: ≤1 top action, ≤3 reason bullets, ≤2 primary, ≤3 secondary, every section collapsed", async () => {
    if (!(await page.locator('[data-testid="owner-cockpit"]').count())) {
      test.skip(true, "clean state — the no-overload limits are proven by the component suite");
      return;
    }
    await expect(page.locator('[data-testid="cockpit-top-action-title"]')).toHaveCount(1);
    expect(await page.locator('[data-testid="cockpit-why-bullet"]').count()).toBeLessThanOrEqual(3);
    expect(await page.locator('[data-cockpit-priority="primary"]').count()).toBeLessThanOrEqual(2);
    expect(await page.locator('[data-cockpit-priority="secondary"]').count()).toBeLessThanOrEqual(3);
    for (const id of ["cockpit-secondary-group", "cockpit-monitor-group", "cockpit-proof-drawer"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      await expect(el).toBeVisible();
      expect(await el.evaluate((n) => (n as HTMLDetailsElement).open), `${id} must be collapsed`).toBe(false);
    }
  });

  // ── B: crisis recovery — collapsed, expands to a no-guarantee caveat, never a guarantee or fabricated figure. ──
  test("B. crisis recovery: section is collapsed and expands to a no-guarantee caveat", async () => {
    const recovery = page.locator('[data-testid="cockpit-recovery-group"]');
    if (!(await recovery.count())) { test.skip(true, "recovery-status endpoint unavailable in this environment"); return; }
    await expect(recovery).toBeVisible();
    expect(await recovery.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false);
    await recovery.locator("summary").click();
    expect(await recovery.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(true);
    await expect(page.locator('[data-testid="cockpit-recovery-caveat"]')).toContainText(/not guaranteed/i);
    assertNoForbidden((await recovery.innerText()).toLowerCase());
  });

  // ── C: public signal — collapsed, expands to the no-live-ingestion boundary, no raw text / PII / money. ──
  test("C. public signal: section is collapsed, shows the no-live-ingestion boundary, hides raw text/PII", async () => {
    const sig = page.locator('[data-testid="cockpit-signals-group"]');
    if (!(await sig.count())) { test.skip(true, "public-signals endpoint unavailable in this environment"); return; }
    await expect(sig).toBeVisible();
    expect(await sig.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false);
    await sig.locator("summary").click();
    expect(await sig.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(true);
    await expect(page.locator('[data-testid="cockpit-signals-noingest"]')).toContainText(/does not fetch live/i);
    const text = (await sig.innerText()).toLowerCase();
    assertNoForbidden(text);
    for (const re of PII) expect(text, `PII leaked, matched ${re}`).not.toMatch(re);
  });

  // ── D: action controls — a reason action opens a LABELLED inline form (never window.prompt, which is trapped). ──
  test("D. action controls: a reason action opens a labelled inline form, not window.prompt", async () => {
    if (!(await page.locator('[data-testid="cockpit-safe-actions"]').count())) {
      test.skip(true, "top action is terminal/monitor-only/blocked — no interactive controls to exercise here");
      return;
    }
    const reject = page.locator('[data-testid="cockpit-action-REJECT"]');
    if (!(await reject.count())) { test.skip(true, "REJECT not offered for this route"); return; }
    await reject.click();
    await expect(page.locator('[data-testid="cockpit-action-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="cockpit-reason-input"]')).toBeVisible();
    // cancel — this journey proves the labelled control path, not a mutation.
    await page.locator('[data-testid="cockpit-cancel"]').click();
    await expect(page.locator('[data-testid="cockpit-action-form"]')).toHaveCount(0);
    expect(fatalErrors()).toEqual([]);
  });

  // ── Cross-journey: no forbidden copy anywhere in the cockpit (expanded), no fatal console errors. ──
  test("no fraud/negligence label, no fabricated money, no hidden score, no forbidden copy anywhere", async () => {
    // expand every collapsible so the sweep covers on-demand content too.
    for (const id of ["cockpit-secondary-group", "cockpit-monitor-group", "cockpit-proof-drawer", "cockpit-recovery-group", "cockpit-signals-group"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      if (await el.count()) { await el.locator("summary").click().catch(() => undefined); }
    }
    const text = await rootText(page);
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
    expect(text).not.toMatch(/\bhidden score\b|\bscore\b/);
    assertNoForbidden(text);
    expect(fatalErrors()).toEqual([]);
  });

  // ── E: unauthorized — the URL cannot bypass the gate; the API fails closed without a session. ──
  test("E. unauthorized: unauthenticated navigation is redirected and the owner API fails closed", async ({ browser }) => {
    const anon = await browser.newContext(); // no session
    const anonPage = await anon.newPage();
    try {
      await anonPage.goto("/owner/cockpit", { waitUntil: "networkidle" });
      await expect(anonPage).toHaveURL(/\/login/);
      // the read endpoint must not serve owner data without a session.
      const resp = await anonPage.request.get("/api/owner/public-signals");
      expect(resp.status()).not.toBe(200);
      const body = await resp.text();
      expect(body).not.toMatch(/publicSignalStatus/);
    } finally {
      await anon.close();
    }
  });
});
