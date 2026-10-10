/**
 * OWNER MINIMUM-EFFORT FIRST INPUT — real-browser acceptance (PR #586 amendment).
 *
 * Real Chromium against a running OpsIQ build and a LOCAL throwaway Postgres only (same safety guard
 * as clean-owner-first-run-journey.spec.ts: refuses anything but an explicit loopback DATABASE_URL).
 * Verifies, at desktop (1440) and mobile (390) widths, that the shared QuickFinancialPicture is the
 * dominant first-input experience on My Business AND on the directly-reachable Money page, that the
 * owner empty state routes to My Business, and that one click saves exactly one snapshot and lands on
 * a Money read. Screenshots are written to docs/opsiq/evidence/owner-minimum-effort-input/.
 */
import { completeFirstRunBusinessStep } from "./first-run-helpers";
import { test, expect, type Page, type Browser } from "@playwright/test";
import { resolveTestDatabase } from "../../src/infra/test-database-guard";
import { Client } from "pg";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";

const DATABASE_URL = process.env.DATABASE_URL || "";
const isLocal = (() => {
  try {
    return resolveTestDatabase({ ...process.env, TEST_WITH_DB: "true", DATABASE_URL }).target === "loopback";
  } catch {
    return false;
  }
})();

const SHOTS = "docs/opsiq/evidence/owner-minimum-effort-input";
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function db<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function signupAndLogin(page: Page, email: string, password: string, workspace: string) {
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Business name").fill(workspace);
  for (const cb of await page.locator('input[type="checkbox"]').all()) if (!(await cb.isChecked())) await cb.check();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/signup") && r.request().method() === "POST"),
    page.click('button[type="submit"]'),
  ]);
  expect(res.status(), "signup must succeed").toBe(201);
  await db((c) => c.query("UPDATE users SET email_verified_at = now() WHERE email = $1", [email]));
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/owner/, { timeout: 20000 });
}

async function createBusinessViaUi(page: Page, _name: string, currency: string) {
  // The name is inherited from signup (typed once); first-run asks only type + currency. The quick picture under
  // test is then reached on the Money-data page, where it is the first-input surface for an existing business.
  await completeFirstRunBusinessStep(page, { currency });
  await page.goto("/owner/data", { waitUntil: "networkidle" });
  await expect(page.getByTestId("quick-financial-picture-form")).toBeVisible({ timeout: 15000 });
}

const fill = (page: Page, name: string, v: string) => page.locator(`[data-testid="quick-financial-picture-form"] input[name="${name}"]`).fill(v);
const clear = async (page: Page) => { for (const n of ["revenue", "fixedCosts", "variableCosts", "cashOnHand"]) await fill(page, n, ""); };
const cta = (page: Page) => page.getByTestId("quick-primary-action");
const CASH_HINT = /Physical cash the business holds outside the bank/;
const BANK_INCLUSIVE = /cash and bank|bank (balance )?(and|\+|or) (till|cash)|bank balance you could use/i;
async function assertCashCopy(page: Page, scope = page.locator("body")) {
  await expect(scope.getByText(CASH_HINT).first()).toBeVisible();
  await expect(scope.getByText(/Don't include money in the bank/).first()).toBeVisible();
  await expect(scope.getByText(/enter 0/i).first()).toBeVisible();
  expect(await scope.innerText()).not.toMatch(BANK_INCLUSIVE);
}
async function createBusinessViaApi(page: Page, name: string, businessType: string, currency: string) {
  const res = await page.request.post("/api/owner/recovery/businesses", { data: { name, businessType, currency, b2cSupported: true, b2bSupported: false } });
  expect(res.status()).toBe(201);
  return (await res.json()).id as string;
}
const gfill = (page: Page, name: string, v: string) => page.locator(`[data-testid="onboarding-essential-numbers"] input[name="${name}"]`).fill(v);
const gcta = (page: Page) => page.getByRole("button", { name: "See my first result" });
const cashflowCount = (businessName: string) =>
  db(async (c) => Number((await c.query(
    "SELECT count(*) FROM owner_cashflow_snapshots s JOIN owner_businesses b ON b.id = s.business_id WHERE b.name = $1", [businessName])).rows[0].count));
const snapshotCount = (businessName: string) =>
  db(async (c) => Number((await c.query(
    "SELECT count(*) FROM owner_financial_snapshots s JOIN owner_businesses b ON b.id = s.business_id WHERE b.name = $1", [businessName])).rows[0].count));

async function assertNoHorizontalScroll(page: Page, label: string) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  expect(m.sw, `${label}: documentElement.scrollWidth ${m.sw} must not exceed clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw);
  expect(m.bw, `${label}: body.scrollWidth ${m.bw} must not exceed clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw);
}

async function assertQuickPathCore(page: Page) {
  const form = page.getByTestId("quick-financial-picture-form");
  await expect(form).toBeVisible();
  // exactly four visible amount fields, no textarea/select/required attributes
  const inputs = form.locator('input[type="text"]');
  await expect(inputs).toHaveCount(4);
  for (const i of await inputs.all()) await expect(i).toBeVisible();
  await expect(form.locator("textarea")).toHaveCount(0);
  await expect(form.locator("select")).toHaveCount(0);
  await expect(form.locator("[required]")).toHaveCount(0);
  await expect(page.getByTestId("quick-primary-action")).toHaveCount(1);
  // optional detail collapsed
  expect(await page.getByTestId("quick-more-detail").evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
  // period selector is understandable and defaults to a COMPLETED month
  await expect(form.getByText("These numbers are for")).toBeVisible();
  await expect(form.getByLabel("Last month")).toBeChecked();
  await expect(form.getByLabel("This month so far")).toBeVisible();
  await expect(form.getByLabel("Choose dates")).toBeVisible();
  await expect(page.getByTestId("quick-provisional-note")).toHaveCount(0);
}

test.describe("Owner minimum-effort first input (real browser)", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.setTimeout(420_000);
  mkdirSync(SHOTS, { recursive: true });

  const rand = randomUUID().slice(0, 8);
  const password = "correct-horse-battery-staple";
  const email = `min-effort-${rand}@example.com`;
  // The first business inherits the name typed once at signup (no second name prompt exists).
  const wsA = `MinEffort WS ${rand}`;
  const bizA = wsA;
  const bizB = `Money Route Cafe ${rand}`;

  async function newPage(browser: Browser, width: number, height: number, mobile = false) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    return { ctx, page: await ctx.newPage() };
  }

  test("desktop 1440: My Business quick path, truthful eligibility, one click, no duplicate; Money route; empty state", async ({ browser }) => {
    const { ctx, page } = await newPage(browser, 1440, 900);
    await signupAndLogin(page, email, password, wsA);

    // Owner empty state (no business yet) → My Business, never the legacy Money flow.
    await page.goto("/owner", { waitUntil: "networkidle" });
    const emptyCta = page.getByTestId("owner-empty-setup-cta");
    await expect(emptyCta).toBeVisible();
    await expect(emptyCta).toHaveAttribute("href", "/owner/data");
    await shot(page, "desktop-1-owner-empty-state");
    await emptyCta.click();
    await page.waitForURL(/\/owner\/data/);

    // Existing business with no first-read data.
    await createBusinessViaUi(page, bizA, "GBP");
    await page.reload({ waitUntil: "networkidle" });
    await assertQuickPathCore(page);
    // currency is inherited, not asked
    await expect(page.locator('[data-testid="quick-financial-picture-form"]')).toContainText("(GBP)");
    await assertCashCopy(page, page.getByTestId("quick-financial-picture-form"));
    // no 20-category wall, no domain/source/category choice before first value
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Needed for first read|Knows:|Nothing recorded yet|Everything OpsIQ can use|Starter item/);
    await expect(page.locator('[data-testid^="data-hub-group-"]')).toHaveCount(0);
    await expect(page.getByTestId("data-hub-missing")).toHaveCount(0);
    // secondary methods exist but collapsed
    expect(await page.getByTestId("data-hub-other-ways").evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
    await shot(page, "desktop-2-my-business-quick-start");

    // partial entry → exact missing-fact feedback, CTA disabled, nothing sent
    await fill(page, "revenue", "600000"); await fill(page, "cashOnHand", "180000");
    await expect(page.getByTestId("quick-feedback")).toContainText("Still needed for a first read: one cost figure");
    await expect(cta(page)).toBeDisabled();
    await shot(page, "desktop-3-partial-feedback");
    // fixed-cost-only → eligible
    await fill(page, "fixedCosts", "200000");
    await expect(page.getByTestId("quick-feedback")).toContainText("enough for a first read");
    await expect(cta(page)).toBeEnabled();
    // variable-cost-only → eligible
    await fill(page, "fixedCosts", ""); await fill(page, "variableCosts", "250000");
    await expect(cta(page)).toBeEnabled();
    // known zeros → eligible
    await clear(page);
    await fill(page, "revenue", "0"); await fill(page, "fixedCosts", "0"); await fill(page, "cashOnHand", "0");
    await expect(cta(page)).toBeEnabled();
    // invalid → inline error
    await fill(page, "revenue", "six lakh");
    await expect(page.getByText("Enter a number, like 150000.")).toBeVisible();
    await expect(cta(page)).toBeDisabled();
    expect(await snapshotCount(bizA)).toBe(0);

    // optional detail remains reachable
    await page.getByTestId("quick-more-detail").locator("summary").click();
    await expect(page.getByTestId("quick-more-detail").getByRole("link", { name: /manual|spreadsheet|full money/i }).first()).toBeVisible();
    await page.getByTestId("quick-more-detail").locator("summary").click();

    // one primary CTA: FAST DOUBLE CLICK saves + diagnoses exactly once and lands on a Money result
    await clear(page);
    await fill(page, "revenue", "600000"); await fill(page, "fixedCosts", "200000"); await fill(page, "cashOnHand", "180000");
    await cta(page).dblclick();
    await page.waitForURL(/\/owner\/finance/, { timeout: 30000 });
    await expect(page.getByRole("heading", { name: "Money", exact: true })).toBeVisible();
    await expect(page.getByTestId("finance-quick-start")).toHaveCount(0);
    await expect(page.getByText("+ Add financial snapshot")).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState("networkidle");
    expect(await snapshotCount(bizA), "double click must create exactly ONE snapshot").toBe(1);
    const cycles = await db(async (c) => Number((await c.query(
      "SELECT count(*) FROM owner_finance_cycles f JOIN owner_businesses b ON b.id = f.business_id WHERE b.name = $1", [bizA])).rows[0].count));
    expect(cycles, "a diagnosis was produced").toBeGreaterThanOrEqual(1);
    const fixed = await db(async (c) => (await c.query(
      "SELECT s.revenue, s.fixed_costs, s.variable_costs, s.cash_on_hand, s.currency FROM owner_financial_snapshots s JOIN owner_businesses b ON b.id=s.business_id WHERE b.name=$1", [bizA])).rows[0]);
    expect(fixed).toMatchObject({ revenue: 600000, fixed_costs: 200000, variable_costs: null, cash_on_hand: 180000, currency: "GBP" });
    await shot(page, "desktop-4-first-read-on-money");

    // second business without data: reach it via the SIDEBAR Money link
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    // create business B through the governed API with the session cookie (second business UI lives elsewhere)
    const created = await page.request.post("/api/owner/recovery/businesses", {
      data: { name: bizB, businessType: (await db(async (c) => (await c.query("SELECT business_type FROM owner_businesses WHERE name=$1", [bizA])).rows[0].business_type)), currency: "INR", b2cSupported: true, b2bSupported: false },
    });
    expect(created.status()).toBe(201);
    const bId = (await created.json()).id as string;
    await page.evaluate((id) => { window.sessionStorage.setItem("opsiq:active-business", id); }, bId).catch(() => {});
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const selector = page.locator('select[name="businessSelector"]');
    await selector.selectOption(bId);
    await expect(page.getByTestId("quick-financial-picture-form")).toContainText("(INR)");
    // sidebar → Money
    const money = page.getByRole("link", { name: "Money", exact: true }).first();
    if (!(await money.isVisible())) await page.locator("nav summary", { hasText: /Business/ }).first().click();
    await money.click();
    await page.waitForURL(/\/owner\/finance/);
    await expect(page.getByTestId("finance-quick-start")).toBeVisible({ timeout: 15000 });
    await assertQuickPathCore(page);
    await expect(page.getByText("+ Add financial snapshot")).toHaveCount(0);
    await expect(page.locator('input[name="periodStart"]')).toHaveCount(0);
    await assertCashCopy(page, page.getByTestId("quick-financial-picture-form"));
    await shot(page, "desktop-5-money-route-quick-start");
    // full detail still reachable but secondary
    await page.getByTestId("finance-full-detail-toggle").click();
    await expect(page.locator('input[name="periodStart"]')).toBeVisible();
    await expect(page.getByText("Improve the analysis (optional)")).toBeVisible();
    // the detailed form teaches the SAME cash meaning as quick start and Guided setup
    await expect(page.locator('form:has(input[name="periodStart"])').getByText(CASH_HINT)).toBeVisible();
    expect(await page.locator('form:has(input[name="periodStart"])').innerText()).not.toMatch(BANK_INCLUSIVE);
    await page.getByText("Improve the analysis (optional)").click();
    await expect(page.locator('input[name="receivables"]')).toBeVisible();
    await shot(page, "desktop-6-money-full-detail-secondary");
    expect(await snapshotCount(bizB)).toBe(0);

    // ── Guided setup (desktop): same canonical gate, separate bank balance → Cashflow ──
    const bizG = `Guided Cafe ${rand}`;
    const typeA = await db(async (c) => (await c.query("SELECT business_type FROM owner_businesses WHERE name=$1", [bizA])).rows[0].business_type as string);
    const gId = await createBusinessViaApi(page, bizG, typeA, "GBP");
    await page.goto("/owner/onboarding", { waitUntil: "networkidle" });
    await page.locator('select[name="businessSelector"]').selectOption(gId);
    const guided = page.getByTestId("onboarding-essential-numbers");
    await expect(guided).toBeVisible({ timeout: 15000 });
    await assertCashCopy(page, guided);
    await expect(guided.getByText(/^Money in the bank \(GBP\)/)).toBeVisible();
    await expect(gcta(page)).toBeDisabled(); // all blank
    await shot(page, "desktop-7-guided-setup-blank");
    await gfill(page, "revenue", "20000"); await gfill(page, "cashOnHand", "3000");
    await expect(page.getByTestId("onboarding-first-read-feedback")).toContainText("Still needed for a first read: one cost figure");
    await expect(gcta(page)).toBeDisabled();
    await gfill(page, "cashOnHand", ""); await gfill(page, "fixedCosts", "7000");
    await expect(page.getByTestId("onboarding-first-read-feedback")).toContainText("cash in hand");
    await expect(gcta(page)).toBeDisabled();
    await gfill(page, "bankBalance", "5000"); // bank balance alone does not satisfy cash in hand
    await expect(gcta(page)).toBeDisabled();
    await shot(page, "desktop-8-guided-setup-partial");
    expect(await snapshotCount(bizG), "nothing saved while incomplete").toBe(0);
    await gfill(page, "cashOnHand", "0"); // known zero is valid
    await expect(gcta(page)).toBeEnabled();
    await gcta(page).click();
    await expect(page.getByTestId("onboarding-first-result")).toBeVisible({ timeout: 30000 });
    expect(await snapshotCount(bizG)).toBe(1);
    expect(await cashflowCount(bizG), "bank balance went to Cashflow").toBe(1);
    const gRow = await db(async (c) => (await c.query(
      "SELECT s.revenue, s.fixed_costs, s.cash_on_hand FROM owner_financial_snapshots s JOIN owner_businesses b ON b.id=s.business_id WHERE b.name=$1", [bizG])).rows[0]);
    expect(gRow).toMatchObject({ revenue: 20000, fixed_costs: 7000, cash_on_hand: 0 });
    const cfRow = await db(async (c) => (await c.query(
      "SELECT s.bank_balance FROM owner_cashflow_snapshots s JOIN owner_businesses b ON b.id=s.business_id WHERE b.name=$1", [bizG])).rows[0]);
    expect(cfRow.bank_balance).toBe(5000);
    await shot(page, "desktop-9-guided-setup-first-result");
    await ctx.close();
  });

  test("mobile 390: no overflow, usable controls, full journey without zoom", async ({ browser }) => {
    const { ctx, page } = await newPage(browser, 390, 844, true);
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner/, { timeout: 20000 });
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const bId = await db(async (c) => (await c.query("SELECT id FROM owner_businesses WHERE name=$1", [bizB])).rows[0].id as string);
    await page.locator('select[name="businessSelector"]').selectOption(bId);
    const form = page.getByTestId("quick-financial-picture-form");
    await expect(form).toBeVisible();
    await assertQuickPathCore(page);
    await assertCashCopy(page, form);
    await assertNoHorizontalScroll(page, "My Business (mobile)");
    await shot(page, "mobile-1-my-business-quick-start");

    // inputs: inside viewport, not clipped, single column, readable labels
    const boxes = await form.locator('input[type="text"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, t: r.top }; }));
    expect(boxes).toHaveLength(4);
    for (const b of boxes) { expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(390); expect(b.w).toBeGreaterThan(200); }
    expect(new Set(boxes.map((b) => Math.round(b.l))).size, "single column: all fields share one left edge").toBe(1);
    const tops = boxes.map((b) => b.t);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops); // stacked in order, no overlap
    const labelSizes = await form.locator("label").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    for (const s of labelSizes) expect(s).toBeGreaterThanOrEqual(12);
    // business selector does not crush the form
    const selW = await page.locator('select[name="businessSelector"]').evaluate((e) => e.getBoundingClientRect().width);
    expect(selW).toBeLessThanOrEqual(390);
    // period radios usable (visible + clickable)
    await form.getByLabel("This month so far").check();
    await expect(page.getByTestId("quick-provisional-note")).toBeVisible();
    await shot(page, "mobile-2-this-month-provisional-note");
    await assertNoHorizontalScroll(page, "provisional note (mobile)");
    await form.getByLabel("Last month").check();
    // error / feedback text does not overflow
    await fill(page, "revenue", "this is not a number at all, enter it anyway");
    await expect(page.getByText("Enter a number, like 150000.")).toBeVisible();
    await assertNoHorizontalScroll(page, "inline error (mobile)");
    await fill(page, "revenue", "100"); await fill(page, "cashOnHand", "50");
    await expect(page.getByTestId("quick-feedback")).toContainText("Still needed for a first read: one cost figure");
    await assertNoHorizontalScroll(page, "partial feedback (mobile)");
    await shot(page, "mobile-3-partial-feedback");
    // optional disclosure usable
    await page.getByTestId("quick-more-detail").locator("summary").click();
    await expect(page.getByTestId("quick-more-detail").getByRole("link").first()).toBeVisible();
    await assertNoHorizontalScroll(page, "optional detail open (mobile)");
    await shot(page, "mobile-4-optional-detail-open");
    await page.getByTestId("quick-more-detail").locator("summary").click();
    // primary CTA visible without zoom and the journey completes
    await fill(page, "variableCosts", "30");
    await cta(page).scrollIntoViewIfNeeded();
    const vp = await cta(page).evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, h: r.height }; });
    expect(vp.l).toBeGreaterThanOrEqual(0); expect(vp.r).toBeLessThanOrEqual(390); expect(vp.h).toBeGreaterThanOrEqual(36);
    await cta(page).click();
    await page.waitForURL(/\/owner\/finance/, { timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Money", exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("finance-quick-start")).toHaveCount(0);
    // the loading skeleton has gone and the diagnosed Money view (not the legacy empty state) is shown
    await expect(page.getByText(/Loading your money information/i)).toHaveCount(0);
    await expect(page.getByText("+ Add financial snapshot")).toBeVisible({ timeout: 20000 });
    await assertNoHorizontalScroll(page, "Money result (mobile)");
    expect(await snapshotCount(bizB)).toBe(1);
    await shot(page, "mobile-5-first-read-on-money");

    // ── Guided setup (mobile) ──
    const bizH = `Guided Mobile ${rand}`;
    const typeB = await db(async (c) => (await c.query("SELECT business_type FROM owner_businesses WHERE name=$1", [bizB])).rows[0].business_type as string);
    const hId = await createBusinessViaApi(page, bizH, typeB, "INR");
    await page.goto("/owner/onboarding", { waitUntil: "networkidle" });
    await page.locator('select[name="businessSelector"]').selectOption(hId);
    const guided = page.getByTestId("onboarding-essential-numbers");
    await expect(guided).toBeVisible({ timeout: 15000 });
    await assertCashCopy(page, guided);
    await assertNoHorizontalScroll(page, "Guided setup (mobile)");
    const gBoxes = await guided.locator('input[type="text"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; }));
    expect(gBoxes).toHaveLength(5);
    for (const b of gBoxes) { expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(390); expect(b.w).toBeGreaterThan(150); }
    expect(new Set(gBoxes.map((b) => Math.round(b.l))).size, "Guided setup: single column on mobile").toBe(1);
    await shot(page, "mobile-8-guided-setup-blank");
    await gfill(page, "revenue", "100"); await gfill(page, "cashOnHand", "50");
    await expect(page.getByTestId("onboarding-first-read-feedback")).toContainText("one cost figure");
    await expect(gcta(page)).toBeDisabled();
    await assertNoHorizontalScroll(page, "Guided setup partial (mobile)");
    await shot(page, "mobile-9-guided-setup-partial");
    await gfill(page, "variableCosts", "30");
    await gcta(page).scrollIntoViewIfNeeded();
    await expect(gcta(page)).toBeEnabled();
    await gcta(page).click();
    await expect(page.getByTestId("onboarding-first-result")).toBeVisible({ timeout: 30000 });
    await assertNoHorizontalScroll(page, "Guided setup first result (mobile)");
    expect(await snapshotCount(bizH)).toBe(1);
    expect(await cashflowCount(bizH)).toBe(0); // no bank balance entered → Cashflow untouched
    await shot(page, "mobile-10-guided-setup-first-result");
    await ctx.close();
  });

  test("direct Money on mobile for a no-data business shows the shared quick start without overflow", async ({ browser }) => {
    const { ctx, page } = await newPage(browser, 390, 844, true);
    const wsC = `MinEffort WS2 ${rand}`;
    const bizC = wsC;
    const email2 = `min-effort-b-${rand}@example.com`;
    await signupAndLogin(page, email2, password, wsC);
    // owner empty state on mobile → My Business
    await page.goto("/owner", { waitUntil: "networkidle" });
    await expect(page.getByTestId("owner-empty-setup-cta")).toBeVisible();
    await assertNoHorizontalScroll(page, "owner empty state (mobile)");
    await shot(page, "mobile-6-owner-empty-state");
    await page.getByTestId("owner-empty-setup-cta").click();
    await page.waitForURL(/\/owner\/data/);
    await createBusinessViaUi(page, bizC, "INR");
    await page.goto("/owner/finance", { waitUntil: "networkidle" });
    await expect(page.getByTestId("finance-quick-start")).toBeVisible({ timeout: 15000 });
    await assertQuickPathCore(page);
    await assertNoHorizontalScroll(page, "Money pre-first-read (mobile)");
    await assertCashCopy(page, page.getByTestId("quick-financial-picture-form"));
    await shot(page, "mobile-7-money-route-quick-start");
    await ctx.close();
  });
});
