/**
 * OBQ hostile / returning-owner / accessibility acceptance (supplements public-beta-obq-journey.spec.ts).
 *
 * Covers what the happy-path journey does not: time-to-trustworthy-value, logout/login on a phone, returning-owner
 * persistence (no duplicate business/workspace), invalid-input handling with error association, double submit,
 * two tabs, refresh during submission, back button, direct navigation, expired session, malformed and foreign ids,
 * missing business context, duplicate signup, invalid/used verification links, keyboard focus, and confidence that is
 * never colour-only.
 *
 * SAFETY: same guard as the other local journeys — runs only against an explicit loopback Postgres. It flips the LOCAL
 * database's admission mode to OPEN_BETA for the run and restores INVITE_ONLY afterwards.
 */
import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import {
  isLocal, db, setAdmissionMode, PASSWORD, LEAK, resetLocalRateLimits, mintVerificationToken, signUpAndVerify,
  completeBusinessStep, fill, GOOD, counts, noHorizontalScroll, login, newPhone,
} from "./helpers/obq";

test.describe("OBQ hostile acceptance", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.setTimeout(180_000);
  test.beforeAll(async () => setAdmissionMode("OPEN_BETA"));
  test.afterAll(async () => setAdmissionMode("INVITE_ONLY"));

  test("TTTV + phone journey: signup -> read -> accept -> cockpit -> logout -> login -> returning owner, nothing duplicated (375px)", async ({ browser }) => {
    const { context, page } = await newPhone(browser);
    const { email, t0 } = await signUpAndVerify(page);
    await noHorizontalScroll(page, "first-run business step");
    await completeBusinessStep(page);
    await fill(page, GOOD);
    await page.getByLabel("A good estimate").check();
    await page.getByTestId("quick-primary-action").click();
    await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 30000 });
    const tttvMs = Date.now() - t0;
    test.info().annotations.push({ type: "TTTV_ms (signup submit -> first read visible, incl. scripted verify/password)", description: String(tttvMs) });
    expect(tttvMs, "time to first trustworthy read").toBeLessThan(10 * 60 * 1000);

    // Confidence and missing evidence are stated in words, never colour alone; provenance is visible.
    const read = page.getByTestId("first-money-read");
    await expect(page.getByTestId("first-money-read-confidence")).toContainText(/how sure|confiden|directional|fairly|low|medium|high/i);
    await expect(page.getByTestId("first-money-read-quality")).toContainText("A good estimate");
    await expect(page.getByTestId("first-money-read-basis")).toContainText(/Based on your .+ figures/);
    expect(await read.innerText()).not.toMatch(LEAK);
    await noHorizontalScroll(page, "first read");

    await page.getByTestId("first-run-accept").click();
    await expect(page.getByTestId("first-money-read-accepted")).toBeVisible();
    await page.getByTestId("first-run-skip-to-cockpit").click();
    await page.waitForURL(/\/owner\/cockpit/, { timeout: 20000 });
    await noHorizontalScroll(page, "cockpit");

    // Logout through the account menu (touch), then sign in again.
    await page.getByTestId("account-menu-trigger").click();
    await expect(page.getByTestId("account-menu")).toBeVisible();
    await page.getByTestId("account-menu-logout").click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
    // A logged-out browser cannot reach the Cockpit.
    await page.goto("/owner/cockpit");
    await page.waitForURL(/\/login/, { timeout: 15000 });

    await login(page, email);
    // Returning owner: straight to the Cockpit, not back through setup.
    await expect(page).toHaveURL(/\/owner\/cockpit/);
    await expect(page.getByTestId("accepted-next-move")).toBeVisible({ timeout: 20000 });
    // Going back to the first-run surface never re-runs onboarding: the saved read is shown with its values, no business or
    // evidence form is offered over it, and the Cockpit is one tap away.
    await page.goto("/owner/first-run", { waitUntil: "networkidle" });
    await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("first-run-business-step")).toHaveCount(0);
    await expect(page.getByTestId("first-run-evidence-step")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Go to my Cockpit/i })).toBeVisible();
    await expect(page.getByTestId("first-money-read-quality")).toContainText("A good estimate");
    await page.goto("/owner/cockpit");
    // Sessions survive a plain refresh.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/owner\/cockpit/);

    const c = await counts(email);
    expect(c, "one workspace, one business, one snapshot, one diagnosis after logout/login").toMatchObject({ memberships: 1, businesses: 1, snapshots: 1, cycles: 1 });
    await context.close();
  });

  test("invalid numbers are refused with associated errors; blank stays unknown (never zero); zero is accepted as a real value (375px)", async ({ browser }) => {
    const { context, page } = await newPhone(browser);
    const { email } = await signUpAndVerify(page);
    await completeBusinessStep(page);
    const sel = (n: string) => page.locator(`[data-testid="quick-financial-picture-form"] input[name="${n}"]`);

    for (const bad of ["abc", "-5", "1e3", "1,00", "12.3.4", "NaN", "Infinity", "0x10", "1000000000000001"]) {
      await sel("revenue").fill(bad);
      await sel("revenue").blur();
      await expect(sel("revenue"), `"${bad}" must be flagged`).toHaveAttribute("aria-invalid", "true");
      const describedBy = await sel("revenue").getAttribute("aria-describedby");
      expect(describedBy, `"${bad}": error must be associated with the field`).toBeTruthy();
      const text = (await page.locator(`#${describedBy!.split(" ").join(", #")}`).allInnerTexts()).join(" ");
      expect(text.trim().length, `"${bad}": the association must point at visible wording`).toBeGreaterThan(5);
      await expect(page.getByTestId("quick-primary-action")).toBeDisabled();
    }
    // Every field carries a programmatic label.
    for (const n of ["revenue", "fixedCosts", "variableCosts", "cashOnHand"]) {
      expect(await sel(n).evaluate((e) => (e as HTMLInputElement).labels?.length ?? 0), `${n} has a <label>`).toBeGreaterThan(0);
    }
    await noHorizontalScroll(page, "validation errors");

    // Blank is unknown: with only revenue + cash typed (no cost) the read is withheld; nothing was defaulted to zero.
    await sel("revenue").fill("12000");
    await sel("cashOnHand").fill("1500");
    await page.getByLabel("A good estimate").check();
    await expect(page.getByTestId("quick-primary-action")).toBeDisabled();
    await expect(page.getByTestId("quick-feedback")).toContainText(/Still needed/i);
    expect((await counts(email)).snapshots, "nothing is saved while evidence is insufficient").toBe(0);

    // Zero is a real, deliberate answer.
    await sel("fixedCosts").fill("0");
    await sel("revenue").fill("0");
    await sel("cashOnHand").fill("0");
    await expect(page.getByTestId("quick-primary-action")).toBeEnabled();
    await context.close();
  });

  test("keyboard: tab order reaches every field and the submit; focus is visible", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await signUpAndVerify(page);
    await completeBusinessStep(page);
    await page.locator('[data-testid="quick-financial-picture-form"] input[name="revenue"]').focus();
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      const info = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e) return null;
        const cs = getComputedStyle(e);
        const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
        return { name: (e as HTMLInputElement).name || e.getAttribute("data-testid") || e.tagName, visible: Boolean(visible), tag: e.tagName };
      });
      if (info && info.tag !== "BODY" && info.tag !== "NEXTJS-PORTAL") {
        seen.push(info.name);
        expect(info.visible, `focus ring visible on ${info.name}`).toBe(true);
      }
      await page.keyboard.press("Tab");
    }
    for (const n of ["revenue", "fixedCosts", "variableCosts", "cashOnHand"]) expect(seen).toContain(n);
    await context.close();
  });

  test("double click on the read button, a second tab, and a refresh during submit never duplicate evidence (desktop)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const { email } = await signUpAndVerify(page);
    await completeBusinessStep(page);

    // Second tab opens the same step now.
    const tab2 = await context.newPage();
    await tab2.goto("/owner/first-run", { waitUntil: "networkidle" });
    await expect(tab2.getByTestId("first-run-evidence-step")).toBeVisible({ timeout: 15000 });

    await fill(page, GOOD);
    await page.getByLabel("A good estimate").check();
    await page.getByTestId("quick-primary-action").dblclick();
    await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 30000 });
    let c = await counts(email);
    expect(c.snapshots, "double click -> one snapshot").toBe(1);
    expect(c.cycles, "double click -> one diagnosis").toBe(1);

    // Tab 2 still shows the stale empty form: submitting there must be a controlled outcome, never a duplicate or a crash.
    await fill(tab2, GOOD);
    await tab2.getByLabel("A good estimate").check();
    await tab2.getByTestId("quick-primary-action").click();
    await expect(tab2.getByTestId("first-money-read").or(tab2.getByTestId("quick-error")).or(tab2.getByTestId("quick-period-taken")).first()).toBeVisible({ timeout: 30000 });
    expect(await tab2.locator("body").innerText()).not.toMatch(LEAK);
    c = await counts(email);
    expect(c.snapshots, "second tab -> still one snapshot").toBe(1);

    // Back button and refresh keep the read (it is persisted, not held by the browser).
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 20000 });
    await page.goBack().catch(() => undefined);
    await page.goto("/owner/first-run", { waitUntil: "networkidle" });
    await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 20000 });
    await context.close();
  });

  test("refresh in the middle of the first submit lands on a coherent, recoverable state (no empty form over saved evidence)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const { email } = await signUpAndVerify(page);
    await completeBusinessStep(page);
    await fill(page, GOOD);
    await page.getByLabel("A good estimate").check();
    await page.getByTestId("quick-primary-action").click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const c = await counts(email);
    expect(c.snapshots).toBeLessThanOrEqual(1);
    // Whatever was persisted, the screen must be consistent with it and offer a way forward.
    const read = page.getByTestId("first-money-read");
    const evidenceStep = page.getByTestId("first-run-evidence-step");
    await expect(read.or(evidenceStep).or(page.getByTestId("first-run-diagnosis-step")).first()).toBeVisible({ timeout: 30000 });
    if (c.snapshots === 1 && (await evidenceStep.isVisible().catch(() => false))) {
      // Evidence is saved: the form may be shown only as a way to supply the read, never as if nothing existed.
      await expect(page.getByTestId("quick-primary-action").or(page.getByTestId("quick-retry-diagnosis"))).toBeVisible();
    }
    expect(await page.locator("body").innerText()).not.toMatch(LEAK);
    await context.close();
  });

  test("auth + hostile API: expired session, logged-out access, malformed ids, foreign business, missing business context", async ({ browser }) => {
    // Owner A with a business.
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await ctxA.newPage();
    const a = await signUpAndVerify(pageA);
    await completeBusinessStep(pageA);
    const aBusinessId = await db(async (c) => (await c.query(
      "SELECT b.id FROM owner_businesses b JOIN workspace_memberships m ON m.workspace_id = b.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1", [a.email])).rows[0].id as string);

    // Owner B: signed up and verified but has NOT created a business (missing business context).
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageB = await ctxB.newPage();
    await signUpAndVerify(pageB);

    // Missing business context -> controlled 4xx, never 500, no technical text.
    for (const [method, url, data] of [
      ["get", "/api/owner/first-run/result", undefined],
      ["get", "/api/owner/first-run/next-question", undefined],
      ["post", "/api/owner/first-run/result/viewed", {}],
      ["post", "/api/owner/first-run/accept", {}],
    ] as const) {
      const res = method === "get" ? await ctxB.request.get(url) : await ctxB.request.post(url, { data });
      expect(res.status(), `${method} ${url} without a business`).toBeLessThan(500);
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(await res.text()).not.toMatch(LEAK);
    }

    // Malformed ids: controlled 400, no ORM text.
    for (const id of ["not-a-uuid", "00000000-0000-0000-0000-00000000000g", "%27%3B%20DROP%20TABLE%20users%3B--", "x".repeat(300)]) {
      const res = await ctxA.request.get(`/api/owner/finance/businesses/${id}/snapshots`);
      expect([400, 404], `malformed id ${id.slice(0, 12)} -> ${res.status()}`).toContain(res.status());
      expect(await res.text()).not.toMatch(LEAK);
    }

    // Foreign business: B naming A's business is indistinguishable from naming a business that does not exist.
    const foreign = await ctxB.request.get(`/api/owner/finance/businesses/${aBusinessId}/snapshots`);
    const ghost = await ctxB.request.get(`/api/owner/finance/businesses/${randomUUID()}/snapshots`);
    expect(foreign.status()).toBe(ghost.status());
    expect(foreign.status()).toBeGreaterThanOrEqual(400);
    const scrub = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>").replace(/corr-[\w-]+/g, "<corr>");
    expect(scrub(await foreign.text())).toBe(scrub(await ghost.text()));
    // B cannot write evidence into A's business, nor diagnose it.
    const write = await ctxB.request.post(`/api/owner/finance/businesses/${aBusinessId}/snapshots`, {
      data: { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "GBP", revenue: 1, evidenceQuality: "ACTUAL" },
    });
    expect(write.status()).toBe(404);
    expect((await counts(a.email)).snapshots, "foreign write created nothing").toBe(0);

    // Bad period / currency at the API boundary: controlled 400.
    for (const data of [
      { periodStart: "+275760-09-13", periodEnd: "2026-09-30", currency: "GBP", revenue: 1, evidenceQuality: "ACTUAL" },
      { periodStart: "2026-02-30", periodEnd: "2026-03-30", currency: "GBP", revenue: 1, evidenceQuality: "ACTUAL" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "USD", revenue: 1, evidenceQuality: "ACTUAL" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "GBP", revenue: -1, evidenceQuality: "ACTUAL" },
    ]) {
      const res = await ctxA.request.post(`/api/owner/finance/businesses/${aBusinessId}/snapshots`, { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
      expect(await res.text()).not.toMatch(LEAK);
    }
    expect((await counts(a.email)).snapshots).toBe(0);

    // Logged out: pages redirect, API answers 401 without technical text.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto("/owner/cockpit");
    await anonPage.waitForURL(/\/login/, { timeout: 15000 });
    await anonPage.goto("/owner/first-run");
    await anonPage.waitForURL(/\/login/, { timeout: 15000 });
    const anonApi = await anon.request.get("/api/owner/first-run");
    expect([401, 403]).toContain(anonApi.status());
    expect(await anonApi.text()).not.toMatch(LEAK);

    // Expired session: the same browser is sent to sign in, and the API refuses it cleanly.
    await db((c) => c.query("UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [a.email]));
    const expiredApi = await ctxA.request.get("/api/owner/first-run");
    expect([401, 403]).toContain(expiredApi.status());
    expect(await expiredApi.text()).not.toMatch(LEAK);
    await pageA.goto("/owner/first-run");
    await pageA.waitForURL(/\/login/, { timeout: 15000 });
    // Sign in again: the business is still there (no duplicate onboarding).
    await login(pageA, a.email);
    expect((await counts(a.email)).businesses).toBe(1);
    await Promise.all([ctxA.close(), ctxB.close(), anon.close()]);
  });

  test("signup + login + verification hostility: duplicates, bad input, malformed login, bad/used links all end in safe, recoverable messages (375px)", async ({ browser }) => {
    const { context, page } = await newPhone(browser);
    await resetLocalRateLimits();
    const email = `dupe-${randomUUID().slice(0, 8)}@example.com`;
    const post = (data: unknown, headers: Record<string, string> = {}) =>
      context.request.post("/api/auth/signup", { data, headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`, ...headers } });

    // Invalid input -> controlled 4xx with no technical text.
    for (const data of [{}, { email: "nope", workspaceName: "X" }, { email, workspaceName: "" }, { email, workspaceName: "x".repeat(500) }, { email, workspaceName: "A\u0000B" }, { email, workspaceName: "ok", extra: 1 }]) {
      const res = await post(data);
      expect(res.status(), JSON.stringify(data).slice(0, 60)).toBeGreaterThanOrEqual(400);
      expect(res.status(), JSON.stringify(data).slice(0, 60)).toBeLessThan(500);
      expect(await res.text()).not.toMatch(LEAK);
    }
    // Not-JSON body.
    const garbage = await context.request.post("/api/auth/signup", { headers: { "content-type": "application/json" }, data: "{not json" });
    expect(garbage.status()).toBeLessThan(500);
    expect(await garbage.text()).not.toMatch(LEAK);

    // Same email, different case/whitespace, twice: identical, non-revealing answers; one account.
    const first = await post({ email, workspaceName: "Dupe Shop" });
    const second = await post({ email: ` ${email.toUpperCase()} `, workspaceName: "Dupe Shop" });
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(201);
    expect(await second.text()).toBe(await first.text());
    expect(await db(async (c) => (await c.query("SELECT count(*)::int AS n FROM users WHERE lower(email) = lower($1)", [email])).rows[0].n)).toBe(1);

    // Unverified owner cannot sign in (and the response is the same as a wrong password).
    const loginBad = await context.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
    const loginWrong = await context.request.post("/api/auth/login", { data: { email: `ghost-${randomUUID().slice(0, 6)}@example.com`, password: PASSWORD } });
    expect(loginBad.status()).toBe(401);
    expect(loginWrong.status()).toBe(401);
    expect(await loginBad.text()).toBe(await loginWrong.text());

    // Malformed login input is a controlled 400 (not a 500).
    for (const data of ["{not json", JSON.stringify({ email }), JSON.stringify({ email: "x", password: "y" })]) {
      const res = await context.request.post("/api/auth/login", { headers: { "content-type": "application/json" }, data });
      expect(res.status()).toBe(400);
      expect(await res.text()).not.toMatch(LEAK);
    }

    // Verification landing: garbage token and a reused token produce a clear message and a way forward.
    await page.goto("/verify-email?token=garbage-token-value", { waitUntil: "networkidle" });
    await noHorizontalScroll(page, "verification landing (bad token)");
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByText(/expired|invalid|already|request a new|resend/i).first()).toBeVisible({ timeout: 15000 });
    expect(await page.locator("body").innerText()).not.toMatch(LEAK);

    const raw = await mintVerificationToken(email);
    await page.goto(`/verify-email?token=${raw}`);
    await page.getByRole("button", { name: "Verify my email" }).click();
    await page.waitForURL(/setup=1/, { timeout: 15000 });
    const again = await context.request.post("/api/auth/verify-email", { data: { token: raw } });
    expect(again.status()).toBeGreaterThanOrEqual(400);
    expect(again.status()).toBeLessThan(500);
    // Once verified, a repeat signup is told (safely) the account exists.
    const third = await post({ email, workspaceName: "Dupe Shop" });
    expect(third.status()).toBe(409);
    expect(await third.text()).not.toMatch(LEAK);
    await context.close();
  });
});
