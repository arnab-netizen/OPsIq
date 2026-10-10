/**
 * PUBLIC BETA OBQ — the canonical value journey, protected end to end:
 *
 *   anonymous visitor -> Start free -> signup (business name typed ONCE) -> real verification link ->
 *   authenticated session -> first-run (inherited name, type + currency only) -> minimal finance evidence with
 *   reliability -> "Your first Money read" (evidence, confidence, estimate truth) -> accept one action -> Cockpit.
 *
 * Negative controls: insufficient evidence, rough vs actual estimate, governed correction (nothing overwritten),
 * established returning owner (never sent back through setup), foreign tenant / foreign business.
 * Mobile: every step at a 375px viewport with no horizontal scroll and finger-sized controls.
 *
 * SAFETY: runs only against an explicit loopback Postgres (same guard as the other local journeys). It flips the
 * LOCAL test database's admission mode to OPEN_BETA for the run and restores INVITE_ONLY afterwards. The real-email
 * production acceptance is intentionally separate (tests/production) and not part of this file.
 */
import { test, expect, type Page, type Browser } from "@playwright/test";
import { resolveTestDatabase } from "../../src/infra/test-database-guard";
import { Client } from "pg";
import { randomUUID, createHash } from "crypto";
import * as bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL || "";
const isLocal = (() => {
  try {
    return resolveTestDatabase({ ...process.env, TEST_WITH_DB: "true", DATABASE_URL }).target === "loopback";
  } catch {
    return false;
  }
})();

async function db<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function setAdmissionMode(mode: "OPEN_BETA" | "INVITE_ONLY") {
  await db((c) =>
    c.query(
      `INSERT INTO platform_settings (id, admission_mode, capacity_limit, version, updated_at)
       VALUES ('global', $1, 500, 0, now())
       ON CONFLICT (id) DO UPDATE SET admission_mode = EXCLUDED.admission_mode, capacity_limit = 500, updated_at = now()`,
      [mode],
    ),
  );
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function expectNoHorizontalScroll(page: Page, label: string) {
  // The authenticated shell scrolls INSIDE <main> (overflow-y:auto makes overflow-x auto too), so overflowing content there
  // never moves the document width: measure the document AND every scroll container on the page.
  const m = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const containers = [...document.querySelectorAll("main, [role=main], body")] as HTMLElement[];
    const inner = Math.max(0, ...containers.map((el) => el.scrollWidth - el.clientWidth));
    // Every visible element's right edge must sit inside the viewport (catches clipped actions inside a scroller).
    const vw = document.documentElement.clientWidth;
    let clipped = 0;
    for (const el of document.querySelectorAll("main a, main button, main input, main select, main textarea, main label")) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > vw + 1) clipped++;
    }
    // Name the widest offenders so a failure points at the element, not just a number.
    const wide = [...document.querySelectorAll("main *")]
      .map((el) => ({ el: el as HTMLElement, w: (el as HTMLElement).scrollWidth, r: (el as HTMLElement).getBoundingClientRect().right }))
      .filter((x) => x.r > vw + 1 || x.w > vw + 1)
      .slice(0, 4)
      .map((x) => `${x.el.tagName.toLowerCase()}${x.el.dataset.testid ? `[${x.el.dataset.testid}]` : ""}.${String(x.el.className).slice(0, 60)} right=${Math.round(x.r)} sw=${x.w}`);
    return { doc, inner, clipped, wide };
  });
  expect(m.doc, `${label}: page must not scroll horizontally`).toBeLessThanOrEqual(1);
  expect(m.inner, `${label}: no inner scroll container may scroll horizontally; offenders: ${m.wide.join(" | ")}`).toBeLessThanOrEqual(1);
  expect(m.clipped, `${label}: no control may extend past the right edge`).toBe(0);
}

/** The production standard for a launch-path control on a phone: a 44px-tall tap target. */
const MIN_TAP_PX = 44;
/** Below 16px, iOS Safari zooms the page when a text field is focused. */
const MIN_INPUT_FONT_PX = 16;

async function expectFingerSizedControls(page: Page, selector: string, label: string) {
  const els = await page.locator(selector).all();
  expect(els.length, `${label}: selector matched no controls (the check would be vacuous)`).toBeGreaterThan(0);
  for (const el of els) {
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    expect(box?.height ?? 0, `${label}: control must be at least ${MIN_TAP_PX}px tall`).toBeGreaterThanOrEqual(MIN_TAP_PX);
  }
}

/** Every visible text-entry control in `scope` must be tall enough to tap and large enough not to trigger iOS zoom. */
async function expectNoZoomInputs(page: Page, scope: string, label: string) {
  const fields = await page.locator(`${scope} input:not([type=radio]):not([type=checkbox]):not([type=hidden]), ${scope} select, ${scope} textarea`).all();
  for (const el of fields) {
    if (!(await el.isVisible())) continue;
    const m = await el.evaluate((n) => ({ font: parseFloat(getComputedStyle(n).fontSize), height: n.getBoundingClientRect().height, name: (n as HTMLInputElement).name || n.tagName }));
    expect(m.font, `${label}: ${m.name} font must be >= ${MIN_INPUT_FONT_PX}px (iOS focus zoom)`).toBeGreaterThanOrEqual(MIN_INPUT_FONT_PX);
    expect(m.height, `${label}: ${m.name} must be at least ${MIN_TAP_PX}px tall`).toBeGreaterThanOrEqual(MIN_TAP_PX);
  }
}

/**
 * The per-IP limiters (signup, verification, login) are real protections; a suite that signs up many owners from
 * one loopback IP must start each journey with a clean bucket. Local test database only (guarded above).
 */
async function resetLocalRateLimits() {
  await db((c) => c.query("DELETE FROM rate_limit_buckets WHERE key LIKE 'signup:%' OR key LIKE 'verify-email-redeem:%' OR key LIKE 'login:%' OR key LIKE 'product-events:%'"));
}

/** Visit the homepage, press Start free, sign up, and redeem a real single-use verification link. */
async function signUpAndVerify(page: Page, opts: { mobile?: boolean } = {}) {
  await resetLocalRateLimits();
  const rand = randomUUID().slice(0, 8);
  const email = `obq-${rand}@example.com`;
  const password = "correct-horse-battery-staple";
  const businessName = `Harbour Laundry ${rand}`;

  await page.goto("/", { waitUntil: "networkidle" });
  const startFree = page.getByTestId("start-free-cta").first();
  await expect(startFree, "OPEN_BETA homepage must offer Start free").toBeVisible();
  await expect(page.getByText(/request beta access/i)).toHaveCount(0);
  if (opts.mobile) {
    await expectNoHorizontalScroll(page, "homepage");
    await expectFingerSizedControls(page, '[data-testid="start-free-cta"]', "homepage CTA");
  }
  await startFree.click();
  await page.waitForURL(/\/signup/);

  // The business name is typed here, ONCE.
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Business name", { exact: true }).fill(businessName);
  for (const cb of await page.locator('input[type="checkbox"]').all()) if (!(await cb.isChecked())) await cb.check();
  if (opts.mobile) {
    await expectNoHorizontalScroll(page, "signup");
    await expectNoZoomInputs(page, "form", "signup");
    await expectFingerSizedControls(page, 'form button[type="submit"], form label:has(input[type="checkbox"])', "signup");
  }
  const [signupRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/signup") && r.request().method() === "POST"),
    page.click('button[type="submit"]'),
  ]);
  expect(signupRes.status()).toBe(201);
  await expect(page.getByText(/check your email/i)).toBeVisible();
  // Recovery is self-service: spam hint + resend link that carries the address.
  await expect(page.getByRole("link", { name: /resend the verification email/i })).toHaveAttribute("href", new RegExp(encodeURIComponent(email)));
  if (opts.mobile) await expectFingerSizedControls(page, '[data-testid="signup-resend-link"]', "signup recovery");

  // Redeem a real token through the real page + route (the email provider is absent locally, so the link is minted here).
  const raw = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  await db(async (c) => {
    const u = await c.query("SELECT id FROM users WHERE email = $1", [email]);
    await c.query(
      "INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
      [randomUUID(), u.rows[0].id, sha256(raw)],
    );
  });
  await page.goto(`/verify-email?token=${raw}`);
  await expect(page.getByText(/email verified/i)).toBeVisible({ timeout: 15000 });
  if (opts.mobile) await expectNoHorizontalScroll(page, "verification landing");
  await page.waitForURL(/\/owner\/first-run/, { timeout: 15000 });
  return { email, password, businessName };
}

async function completeBusinessStep(page: Page, businessName: string, opts: { mobile?: boolean } = {}) {
  await expect(page.getByTestId("first-run-business-step")).toBeVisible({ timeout: 15000 });
  // Inherited, not re-asked.
  await expect(page.getByTestId("first-run-business-name")).toHaveText(businessName);
  expect(await page.locator('input[name="name"]').count(), "business name must not be asked again").toBe(0);
  await page.getByLabel(/what kind of business/i).selectOption({ index: 1 });
  await page.getByLabel(/which currency/i).selectOption("GBP");
  if (opts.mobile) {
    await expectNoHorizontalScroll(page, "business profile");
    await expectFingerSizedControls(page, "main button, main select", "business profile");
    await expectNoZoomInputs(page, "main", "business profile");
  }
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/owner/first-run/business") && r.request().method() === "POST"),
    page.getByTestId("first-run-business-submit").click(),
  ]);
  expect(res.status()).toBe(201);
  await expect(page.getByTestId("first-run-evidence-step")).toBeVisible({ timeout: 15000 });
}

async function fillEvidence(page: Page, v: { revenue?: string; fixedCosts?: string; variableCosts?: string; cashOnHand?: string }) {
  for (const [name, value] of Object.entries(v)) {
    await page.locator(`[data-testid="quick-financial-picture-form"] input[name="${name}"]`).fill(value);
  }
}

async function chooseQualityAndRead(page: Page, quality: "From my records" | "A good estimate" | "A rough guess") {
  await page.getByLabel(quality).check();
  await page.getByTestId("quick-primary-action").click();
  await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 30000 });
}

test.describe("Public beta OBQ journey", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.setTimeout(120_000);

  test.beforeAll(async () => setAdmissionMode("OPEN_BETA"));
  test.afterAll(async () => setAdmissionMode("INVITE_ONLY"));

  for (const viewport of [
    { name: "desktop", size: { width: 1280, height: 800 }, mobile: false },
    { name: "mobile 390px", size: { width: 390, height: 844 }, mobile: true },
    { name: "mobile 375px", size: { width: 375, height: 667 }, mobile: true },
  ]) {
    test(`visitor to Cockpit with an accepted action — ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: viewport.size });
      const page = await context.newPage();
      const { businessName } = await signUpAndVerify(page, { mobile: viewport.mobile });
      await completeBusinessStep(page, businessName, { mobile: viewport.mobile });

      // Insufficient evidence is held back, with plain guidance — nothing is saved or diagnosed.
      await fillEvidence(page, { revenue: "12000" });
      await expect(page.getByTestId("quick-primary-action")).toBeDisabled();
      await expect(page.getByTestId("quick-feedback")).toContainText(/Still needed for a first read/i);

      await fillEvidence(page, { fixedCosts: "7000", variableCosts: "4000", cashOnHand: "1500" });
      // The owner must say how reliable the numbers are before a read is made.
      await expect(page.getByTestId("quick-primary-action")).toBeDisabled();
      if (viewport.mobile) {
        await expectNoHorizontalScroll(page, "quick evidence");
        await expectFingerSizedControls(page, '[data-testid="quick-financial-picture-form"] label:has(input[type=radio]), [data-testid="quick-primary-action"]', "quick evidence");
        await expectNoZoomInputs(page, '[data-testid="quick-financial-picture-form"]', "quick evidence");
      }
      await chooseQualityAndRead(page, "A rough guess");

      // First result: honest scope, evidence, confidence, estimate truth, exactly three paths.
      const read = page.getByTestId("first-money-read");
      await expect(read.getByRole("heading", { name: "Your first Money read" })).toBeVisible();
      await expect(page.getByTestId("first-money-read-scope")).toContainText(/money figures only/i);
      await expect(page.getByTestId("first-money-read-scope")).toHaveAttribute("data-scope-kind", "FINANCIAL_FIRST_READ");
      // The period, its completed/provisional status and the evidence quality are always on the card.
      await expect(page.getByTestId("first-money-read-basis")).toContainText(/Based on your .+ figures/);
      await expect(page.getByTestId("first-money-read-basis")).toContainText(/completed period|provisional/);
      await expect(page.getByTestId("first-money-read-basis")).toContainText("A rough guess");
      await expect(page.getByTestId("first-money-read-quality")).toContainText("A rough guess");
      await expect(page.getByTestId("first-money-read-confidence")).not.toContainText(/fairly confident/i);
      // The first read leads with something about the money, not a request for more data, and never shows a raw key.
      await expect(page.getByTestId("first-money-read-noticed")).not.toContainText(/data completeness/i);
      expect(await read.innerText()).not.toMatch(/\b[a-z]+[A-Z][A-Za-z]+\b/);
      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      expect(bodyText).not.toMatch(/biggest (business )?problem/);
      await expect(page.getByTestId("first-money-read-actions").locator("button")).toHaveCount(3);
      if (viewport.mobile) {
        await expectNoHorizontalScroll(page, "first result");
        await expectFingerSizedControls(page, '[data-testid="first-money-read-actions"] button', "result actions");
      }

      // Accept the one action.
      const [acceptRes] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/owner/first-run/accept") && r.request().method() === "POST"),
        page.getByTestId("first-run-accept").click(),
      ]);
      expect(acceptRes.status()).toBe(201);
      await expect(page.getByTestId("first-money-read-accepted")).toBeVisible();
      await expect(page.getByTestId("first-value-feedback")).toBeVisible();
      await expect(page.getByTestId("first-run-goal-prompt")).toContainText(/optional/i);
      if (viewport.mobile) await expectNoHorizontalScroll(page, "after accept");

      await page.getByTestId("first-run-skip-to-cockpit").click();
      await page.waitForURL(/\/owner\/cockpit/, { timeout: 20000 });
      await expect(page.getByText(/Set up your business to get your first assessment/)).toHaveCount(0);
      // The canonical Cockpit shows the action just accepted, with its timing.
      await expect(page.getByTestId("accepted-next-move")).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId("accepted-next-move-prompt")).toContainText(/due/i);
      if (viewport.mobile) {
        await expectNoHorizontalScroll(page, "cockpit");
        await expectFingerSizedControls(page, '[data-testid="accepted-next-move"] a, [data-testid="accepted-next-move"] button', "cockpit accepted move");
      }
      expect((await page.locator("body").innerText()).toLowerCase(), "owners never see the word workspace").not.toMatch(/\bworkspace\b/);
      await context.close();
    });
  }

  test("correction: nothing overwritten, read re-run, changes shown (mobile width)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    const { businessName, email } = await signUpAndVerify(page);
    await completeBusinessStep(page, businessName);
    await fillEvidence(page, { revenue: "12000", fixedCosts: "7000", variableCosts: "4000", cashOnHand: "1500" });
    await chooseQualityAndRead(page, "A rough guess");

    await page.getByTestId("first-run-correct").click();
    await expect(page.getByTestId("first-result-correction")).toBeVisible();
    await expectNoHorizontalScroll(page, "correction");
    await page.locator('[data-testid="first-result-correction"] input[name="cashOnHand"]').fill("0"); // a real zero
    await page.getByTestId("first-result-correction").getByLabel("From my records").check();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/owner/first-run/correct") && r.request().method() === "POST"),
      page.getByTestId("first-result-correction-submit").click(),
    ]);
    expect(res.status()).toBe(201);
    await expect(page.getByTestId("first-result-changes")).toContainText(/cash in hand/i);
    await expect(page.getByTestId("first-result-changes")).not.toContainText(/cashOnHand|ROUGH_ESTIMATE|ACTUAL|LOW|MEDIUM/);
    await expect(page.getByTestId("first-money-read-quality")).toContainText("From my records");
    await expect(page.getByTestId("first-money-read")).toBeVisible();

    // History is kept: two versions, the first superseded and unchanged.
    const rows = await db((c) =>
      c.query(
        `SELECT s.version, s.cash_on_hand, s.evidence_quality, s.superseded_by_id IS NOT NULL AS superseded
           FROM owner_financial_snapshots s JOIN owner_businesses b ON b.id = s.business_id
           JOIN workspace_memberships m ON m.workspace_id = b.workspace_id JOIN users u ON u.id = m.user_id
          WHERE u.email = $1 ORDER BY s.version`,
        [email],
      ),
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ version: 1, cash_on_hand: 1500, evidence_quality: "ROUGH_ESTIMATE", superseded: true });
    expect(rows.rows[1]).toMatchObject({ version: 2, cash_on_hand: 0, evidence_quality: "ACTUAL", superseded: false });
    await context.close();
  });

  test("improve: persisted progress, skip is remembered, Add this returns and shows what changed (390px)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const { businessName } = await signUpAndVerify(page);
    await completeBusinessStep(page, businessName);
    await fillEvidence(page, { revenue: "12000", fixedCosts: "7000", variableCosts: "4000", cashOnHand: "1500" });
    await chooseQualityAndRead(page, "A good estimate");
    await page.getByTestId("first-run-improve").click();
    await expect(page.getByTestId("first-result-improvement")).toBeVisible();
    await expectNoHorizontalScroll(page, "progressive question");
    const q = page.getByTestId("first-result-improvement-question");
    const done = page.getByTestId("first-result-improvement-done");
    // This business has money gaps the catalog asks about, so a question MUST be offered (the checks below are not optional).
    await expect(q, "a progressive question must be offered here").toBeVisible({ timeout: 15000 });
    expect(await done.count()).toBe(0);
    await expect(page.getByTestId("first-result-improvement-progress")).toContainText(/0 of up to 3/);
    {
      await expect(q).toContainText(/It could change/);
      await expect(q).toContainText(/Effort/);
      // Money evidence first: the question is about the money picture, not a rota or a certificate.
      await expect(q).not.toContainText(/proof of completion|staff rota|training/i);
      await expectFingerSizedControls(page, '[data-testid="first-result-improvement"] a, [data-testid="first-result-improvement"] button', "progressive question");

      // Skip it: the skip is saved on the server, survives a reload, and the same question is not offered again.
      const asked = (await q.locator("p").first().innerText()).trim();
      await page.getByTestId("first-result-improvement-skip").click();
      await expect(page.getByTestId("first-result-improvement-progress")).toContainText(/1 of up to 3/);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 20000 });
      await page.getByTestId("first-run-improve").click();
      await expect(page.getByTestId("first-result-improvement-progress")).toContainText(/1 of up to 3/);
      const again = page.getByTestId("first-result-improvement-question");
      if (await again.isVisible().catch(() => false)) {
        expect((await again.locator("p").first().innerText()).trim(), "a skipped question must not be asked again").not.toBe(asked);
      }

      // "Add this" goes to the existing input surface with a way back; returning re-runs the read and says what changed.
      const add = page.getByTestId("first-result-improvement-add");
      await expect(add, "\"Add this\" must be offered for a question with an input surface").toBeVisible();
      {
        await add.click();
        await page.waitForURL(/returnTo=first-run/);
        const bar = page.getByTestId("first-run-return-bar");
        await expect(bar).toBeVisible();
        await expectFingerSizedControls(page, '[data-testid="first-run-return-link"]', "return bar");
        await expectNoHorizontalScroll(page, "input surface with return bar");
        await page.getByTestId("first-run-return-link").click();
        await page.waitForURL(/\/owner\/first-run/, { timeout: 20000 });
        await expect(page.getByTestId("first-result-improved")).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId("first-money-read")).toBeVisible();
        expect(page.url(), "the update flag is consumed").not.toMatch(/update=1/);
      }
    }
    const later = page.getByTestId("first-result-improvement-later");
    if (await later.isVisible().catch(() => false)) await later.click();
    await context.close();
  });

  test("a stale read cannot be accepted: another tab corrects the figures first (READ_STALE)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const { businessName } = await signUpAndVerify(page);
    await completeBusinessStep(page, businessName);
    await fillEvidence(page, { revenue: "12000", fixedCosts: "7000", variableCosts: "4000", cashOnHand: "1500" });
    await chooseQualityAndRead(page, "From my records");

    // "Another tab" (same session) corrects the figures through the governed route while this read is still on screen.
    const info = await (await context.request.get("/api/owner/first-run")).json();
    const corrected = await context.request.post("/api/owner/first-run/correct", {
      data: { businessId: info.business.id, snapshotId: info.currentSnapshotId, amendmentReason: "Other tab", revenue: 9000, evidenceQuality: "GOOD_ESTIMATE" },
    });
    expect(corrected.status()).toBe(201);

    const [acceptRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/owner/first-run/accept") && r.request().method() === "POST"),
      page.getByTestId("first-run-accept").click(),
    ]);
    expect(acceptRes.status(), "accepting a read built on superseded figures must be refused").toBe(409);
    // The screen was already refreshed to the new read, so it says so rather than asking for an update that is done.
    await expect(page.getByTestId("first-run-action-error")).toHaveText("Your numbers changed since this read was created, so OpsIQ has refreshed it. Review the new read, then choose again.");
    const decisions = await db((c) => c.query("SELECT count(*)::int AS n FROM owner_decision_records d JOIN owner_businesses b ON b.id = d.business_id WHERE b.id = $1", [info.business.id]));
    expect(decisions.rows[0].n).toBe(0);
    // The screen then shows the CURRENT read (revenue was corrected, so the estimate label changed).
    await expect(page.getByTestId("first-money-read-quality")).toContainText("A good estimate");
    await context.close();
  });

  test("established owner signing in again is not sent back through setup; a foreign tenant cannot read the business", async ({ browser }) => {
    // Owner A completes the journey.
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    const ownerA = await signUpAndVerify(a);
    await completeBusinessStep(a, ownerA.businessName);
    await fillEvidence(a, { revenue: "12000", fixedCosts: "7000", variableCosts: "4000", cashOnHand: "1500" });
    await chooseQualityAndRead(a, "From my records");
    await a.getByTestId("first-run-accept").click();
    await expect(a.getByTestId("first-money-read-accepted")).toBeVisible();
    const ctxInfo = await ctxA.request.get("/api/owner/first-run");
    const info = await ctxInfo.json();
    expect(info.state).toBe("ESTABLISHED");
    const businessId: string = info.business.id;
    await ctxA.close();

    // Returning: fresh browser, plain login -> Cockpit, never /owner/first-run.
    const ctxA2 = await browser.newContext();
    const a2 = await ctxA2.newPage();
    await a2.goto("/login", { waitUntil: "networkidle" });
    await a2.fill('input[type="email"]', ownerA.email);
    await a2.fill('input[type="password"]', ownerA.password);
    await a2.click('button[type="submit"]');
    await a2.waitForURL(/\/owner\/cockpit/, { timeout: 20000 });
    expect(a2.url()).not.toMatch(/first-run/);
    await expect(a2.getByTestId("accepted-next-move")).toBeVisible({ timeout: 20000 });
    await ctxA2.close();

    // Owner B (a different tenant) cannot read, accept, correct, or ask questions about A's business.
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await signUpAndVerify(b);
    for (const res of [
      await ctxB.request.get(`/api/owner/first-run/result?businessId=${businessId}`),
      await ctxB.request.get(`/api/owner/first-run/next-question?businessId=${businessId}`),
      await ctxB.request.post("/api/owner/first-run/accept", { data: { businessId, readCycleId: randomUUID(), idempotencyKey: "foreign-key-0001" } }),
      await ctxB.request.post("/api/owner/first-run/improve", { data: { businessId, category: "fixed_costs" } }),
      await ctxB.request.post("/api/owner/first-run/skip-question", { data: { businessId, category: "fixed_costs" } }),
    ]) {
      expect([403, 404], `foreign business must be refused, got ${res.status()}`).toContain(res.status());
    }
    // B's own state is still its own: a brand-new owner at step A.
    const bInfo = await (await ctxB.request.get("/api/owner/first-run")).json();
    expect(bInfo.state).toBe("NEEDS_BUSINESS");
    await ctxB.close();
  });

  test("a rough estimate is labelled and scores lower than actual records for the same numbers", async ({ browser }) => {
    const seen: Record<string, { label: string; score: number }> = {};
    for (const quality of ["From my records", "A rough guess"] as const) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const owner = await signUpAndVerify(page);
      await completeBusinessStep(page, owner.businessName);
      await fillEvidence(page, { revenue: "12000", fixedCosts: "7000", variableCosts: "4000", cashOnHand: "1500" });
      await chooseQualityAndRead(page, quality);
      const label = (await page.getByTestId("first-money-read-quality").innerText()).replace(/How reliable your numbers are\s*/i, "").split("\n")[0].trim();
      const score = await db(async (c) => {
        const r = await c.query(
          `SELECT s.data_confidence_score FROM owner_financial_snapshots s JOIN owner_businesses b ON b.id = s.business_id
             JOIN workspace_memberships m ON m.workspace_id = b.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
          [owner.email],
        );
        return Number(r.rows[0].data_confidence_score);
      });
      seen[quality] = { label, score };
      await ctx.close();
    }
    expect(seen["From my records"].label).toBe("From my records");
    expect(seen["A rough guess"].label).toBe("A rough guess");
    expect(seen["A rough guess"].score).toBeLessThan(seen["From my records"].score);
  });
});

test.describe("Invite-only keeps the governed behaviour", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.beforeAll(async () => setAdmissionMode("INVITE_ONLY"));

  test("homepage still offers request-access and no Start free", async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("start-free-cta")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /request beta access/i }).first()).toBeVisible();
    await ctx.close();
  });
});

test.describe("Admin beta control on a phone (390px)", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.setTimeout(120_000);
  test.beforeAll(async () => setAdmissionMode("OPEN_BETA"));
  test.afterAll(async () => setAdmissionMode("INVITE_ONLY"));

  async function createOperator() {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const email = `ops-${userId.slice(0, 8)}@example.com`;
    const password = "correct-horse-battery-staple";
    const hash = await bcrypt.hash(password, 10);
    await db(async (c) => {
      await c.query("INSERT INTO users (id, email, hashed_password, is_active, requires_email_verification, updated_at) VALUES ($1,$2,$3,true,false,now())", [userId, email, hash]);
      await c.query("INSERT INTO workspaces (id, name, slug, created_by, is_active) VALUES ($1,'Operator HQ',$2,$3,true)", [workspaceId, `ops-${workspaceId.slice(0, 8)}`, userId]);
      await c.query("INSERT INTO workspace_memberships (workspace_id, user_id, role, added_by, is_active) VALUES ($1,$2,'owner',$2,true)", [workspaceId, userId]);
      await c.query("INSERT INTO user_role_assignments (id, user_id, role, scope, scope_id, is_active) VALUES ($1,$2,'administration_operator','workspace',$3,true)", [randomUUID(), userId, workspaceId]);
    });
    return { email, password };
  }

  test("the operator sees mode + capacity, can stop signups with one thumb, and the server enforces it", async ({ browser }) => {
    await resetLocalRateLimits();
    const op = await createOperator();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', op.email);
    await page.fill('input[type="password"]', op.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });

    await page.goto("/admin/beta-programme", { waitUntil: "networkidle" });
    await expect(page.getByTestId("stop-signups-panel")).toBeVisible({ timeout: 20000 });
    await expectNoHorizontalScroll(page, "admin beta programme");

    // Reachable with one thumb: the stop button is on the first screen, not pushed below a setup block.
    await expect(page.getByTestId("stop-signups-button")).toBeInViewport();
    await expect(page.getByTestId("beta-state-mode-value")).toBeInViewport();
    // Critical state is visible without scrolling around: mode and capacity.
    await expect(page.getByTestId("beta-state-mode-value")).toHaveText(/OPEN to anyone/);
    await expect(page.getByTestId("beta-state-capacity")).toContainText(/Places used: \d+ of 500/);

    // Every control is a finger-sized target with a readable (non-zooming) input.
    await expectFingerSizedControls(page, '[data-testid="stop-signups-button"], [data-testid="stop-signups-panel"] button, main button, main select', "admin beta controls");
    await expectNoZoomInputs(page, "main", "admin beta controls");
    // The request list never forces sideways scrolling: phones get cards, wider screens the table.
    await expect(page.getByTestId("beta-requests-cards")).toBeVisible();

    // Stop signups.
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/platform-settings") && r.request().method() === "POST"),
      page.getByTestId("stop-signups-button").click(),
    ]);
    expect(res.status()).toBe(200);
    await expect(page.getByTestId("beta-state-mode-value")).toHaveText("CLOSED");
    await expect(page.getByTestId("stop-signups-button")).toContainText(/closed/i);
    const mode = await db((c) => c.query("SELECT admission_mode FROM platform_settings WHERE id = 'global'"));
    expect(mode.rows[0].admission_mode).toBe("CLOSED");

    // Verify it is ACTUALLY enforced: an anonymous signup is now refused by the server, and the homepage stops offering Start free.
    await resetLocalRateLimits();
    const anon = await browser.newContext();
    const refused = await anon.request.post("/api/auth/signup", {
      data: { email: `late-${randomUUID().slice(0, 8)}@example.com`, password: "correct-horse-battery-staple", workspaceName: "Too Late", acceptTerms: true, acceptPrivacy: true, acceptBetaNotice: true },
    });
    expect(refused.status()).toBe(403);
    const home = await anon.newPage();
    await home.goto("/", { waitUntil: "networkidle" });
    await expect(home.getByTestId("start-free-cta")).toHaveCount(0);
    await anon.close();
    await context.close();
  });
});
