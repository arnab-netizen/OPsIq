/**
 * FIRST LOGIN -> DATA SOURCE -> DATA -> AUTOMATIC FIRST ADVICE, in a real browser, against a LOCAL disposable database only.
 *
 *   Journey A (manual)           signup -> verify -> login -> business -> source step -> manual numbers -> first read.
 *   Journey B (QuickBooks-SHAPED) the same, choosing Connect QuickBooks; Intuit is a CONTROLLED FAKE (see helpers/fake-intuit-preload.cjs).
 *
 * Journey B is NOT a real Intuit OAuth acceptance, NOT a Sandbox company and uses no real business data: the consent screen is a
 * Playwright redirect, the token/report endpoints are answered by the harness fake inside the test server process. What it does prove
 * is OpsIQ's own path: source choice -> governed connect -> callback -> import -> canonical evidence -> automatic first read, with the
 * owner present AND with the owner's browser closed.
 *
 * Journey B needs a server started with the fake enabled (E2E_QBO_SIMULATED=1 here must match that server); it is skipped otherwise.
 * Both journeys flip ONLY the local database's admission mode to OPEN_BETA and restore INVITE_ONLY afterwards.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import {
  isLocal, db, setAdmissionMode, signUpAndVerify, completeBusinessStep, fill, login, counts, noHorizontalScroll, LEAK, GOOD,
} from "./helpers/obq";

const SIMULATED = process.env.E2E_QBO_SIMULATED === "1";
const FAKE_LOG = process.env.OPSIQ_FAKE_INTUIT_LOG || "/var/tmp/fake-intuit-calls.log";
const RUN_ANALYSIS = /run (your |the )?(analysis|diagnosis)/i;

async function firstReadAssertions(page: Page) {
  await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 120_000 });
  // The first meaningful screen is the RESULT: still on first-run, not an empty generic dashboard.
  expect(new URL(page.url()).pathname).toBe("/owner/first-run");
  await expect(page.getByTestId("first-money-read-noticed")).toBeVisible();
  await expect(page.getByTestId("first-money-read-action")).toBeVisible();
  await expect(page.getByTestId("first-money-read-confidence")).toBeVisible();
  await expect(page.getByTestId("first-money-read-quality")).toBeVisible();
  await expect(page.getByTestId("first-run-accept")).toBeEnabled();
  // No manual "run analysis" step anywhere on the screen.
  expect(await page.locator("body").innerText()).not.toMatch(RUN_ANALYSIS);
  await expect(page.getByRole("button", { name: RUN_ANALYSIS })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(LEAK);
}

async function readCounts(email: string) {
  return db(async (c) => {
    const r = await c.query(
      `SELECT (SELECT count(*) FROM qbo_connections q JOIN workspace_memberships m ON m.workspace_id = q.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1)::int AS connections,
              (SELECT count(*) FROM qbo_connections q JOIN workspace_memberships m ON m.workspace_id = q.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1 AND q.status = 'ACTIVE')::int AS active`,
      [email],
    );
    return r.rows[0] as { connections: number; active: number };
  });
}

test.describe("First login to first advice (real browser, local disposable DB)", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.setTimeout(300_000);
  test.beforeAll(async () => setAdmissionMode("OPEN_BETA"));
  test.afterAll(async () => setAdmissionMode("INVITE_ONLY"));

  test("Journey A - MANUAL: signup, verify, login, business, source step, a few numbers -> automatic first read; resumable", async ({ page }) => {
    const t0 = Date.now();
    const { email } = await signUpAndVerify(page);
    const verified = Date.now();

    // Login is part of the journey: sign out, sign back in, and land on the right step from persisted facts.
    await page.context().clearCookies();
    await login(page, email);
    await page.goto("/owner/first-run", { waitUntil: "networkidle" });
    await completeBusinessStep(page);
    const businessDone = Date.now();

    // Source step: the heading and BOTH honest routes (QuickBooks only when this server offers it).
    await expect(page.getByRole("heading", { name: /let.s understand your business/i })).toBeVisible();
    const qboOffered = await page.getByTestId("first-run-quickbooks-route").count();
    expect(qboOffered > 0, "QuickBooks is offered exactly when this server's offer gate is open").toBe(SIMULATED);
    for (const name of [/xero/i, /shopify/i, /hubspot/i, /stripe/i, /\bPOS\b/]) await expect(page.getByText(name)).toHaveCount(0);
    if (SIMULATED) {
      await expect(page.getByTestId("first-run-quickbooks-explainer")).toContainText(/read-only/i);
      await page.getByTestId("first-run-choose-manual").click();
    }
    await noHorizontalScroll(page, "source step");

    // Minimum evidence -> ONE action -> the read appears by itself.
    await fill(page, GOOD);
    await page.getByLabel("A good estimate").check();
    await expect(page.getByTestId("quick-primary-action")).toBeEnabled();
    const evidenceAt = Date.now();
    await page.getByTestId("quick-primary-action").click();
    await firstReadAssertions(page);
    const readAt = Date.now();

    expect(await counts(email)).toMatchObject({ businesses: 1, snapshots: 1, cycles: 1 });
    test.info().annotations.push({ type: "timing_ms", description: JSON.stringify({ signupToVerified: verified - t0, verifiedToBusiness: businessDone - verified, evidenceToFirstRead: readAt - evidenceAt }) });

    // Resumable: a refresh shows the same read, creates nothing, and still has no analysis button.
    await page.reload({ waitUntil: "networkidle" });
    await firstReadAssertions(page);
    expect(await counts(email)).toMatchObject({ businesses: 1, snapshots: 1, cycles: 1 });
  });

  test.describe("Journey B - QuickBooks-SHAPED, CONTROLLED FAKE Intuit (not a real Intuit acceptance)", () => {
    test.skip(!SIMULATED, "Needs the local acceptance server started with the fake-Intuit harness (E2E_QBO_SIMULATED=1).");

    async function connectThroughFakeIntuit(page: Page, base: string) {
      let authorizeUrl: URL | null = null;
      let callbackUrl = "";
      const realm = `93414${String(Date.now()).slice(-9)}`;
      await page.route("https://appcenter.intuit.com/**", async (route) => {
        authorizeUrl = new URL(route.request().url());
        const state = authorizeUrl.searchParams.get("state") ?? "";
        callbackUrl = `${base}/owner/integrations/quickbooks/callback?code=fake-auth-code&state=${encodeURIComponent(state)}&realmId=${realm}`;
        await route.fulfill({ status: 302, headers: { location: callbackUrl } }); // the fake "consent screen": approve immediately
      });
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/owner/integrations/quickbooks/connect") && r.request().method() === "POST"),
        page.getByTestId("qbo-connect").click(),
      ]);
      expect(res.status()).toBe(200);
      await page.waitForURL(/\/owner\/first-run\?quickbooks=/, { timeout: 60_000 }); // back on FIRST-RUN, not My Business
      expect(authorizeUrl, "the browser was sent to the (faked) Intuit authorize URL").not.toBeNull();
      expect(authorizeUrl!.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting"); // read-only-capable scope only
      return { callbackUrl, realm };
    }

    function providerCalls(): Array<{ method: string; host: string; path: string }> {
      return fs.existsSync(FAKE_LOG) ? fs.readFileSync(FAKE_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    }

    test("Journey B1 - owner present: source step -> Connect -> callback -> importing -> automatic first read; QuickBooks only ever READ", async ({ page, baseURL }) => {
      fs.writeFileSync(FAKE_LOG, "");
      const { email } = await signUpAndVerify(page);
      await page.context().clearCookies();
      await login(page, email);
      await page.goto("/owner/first-run", { waitUntil: "networkidle" });
      await completeBusinessStep(page);

      await expect(page.getByTestId("first-run-quickbooks-route")).toBeVisible();
      await expect(page.getByTestId("first-run-quickbooks-explainer")).toContainText(/never changes anything in QuickBooks/i);
      await expect(page.getByTestId("first-run-choose-manual")).toBeVisible(); // the manual route stays one click away
      await noHorizontalScroll(page, "source step with QuickBooks offered");

      const t = Date.now();
      await connectThroughFakeIntuit(page, baseURL!);
      await firstReadAssertions(page);
      test.info().annotations.push({ type: "timing_ms", description: JSON.stringify({ connectClickToFirstRead: Date.now() - t }) });

      expect(await readCounts(email)).toEqual({ connections: 1, active: 1 });
      expect(await counts(email)).toMatchObject({ businesses: 1, cycles: 1 });
      const provenance = await db(async (c) => (await c.query(
        `SELECT count(*)::int AS n FROM owner_financial_snapshots s JOIN workspace_memberships m ON m.workspace_id = s.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1`, [email])).rows[0].n as number);
      expect(provenance).toBeGreaterThan(0);

      // Read-only guarantee, observed at the provider boundary: one token exchange, otherwise GET reports/companyinfo only.
      const calls = providerCalls();
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        if (c.host === "oauth.platform.intuit.com") expect(c.method).toBe("POST");
        else {
          expect(c.method).toBe("GET");
          expect(c.path).toMatch(/^\/v3\/company\/\d+\/(companyinfo\/\d+|reports\/(ProfitAndLoss|BalanceSheet|AgedReceivables|AgedPayables))$/);
        }
      }
      expect(calls.some((c) => c.host === "developer.api.intuit.com"), "no revoke/disconnect happened").toBe(false);
      expect(calls.filter((c) => c.host === "oauth.platform.intuit.com").length, "exactly one authorization-code exchange").toBe(1);

      // Replaying the callback (back button / duplicate click) changes nothing: no second connection, no second read.
      const second = await (async () => { await page.goto(`${baseURL}/owner/integrations/quickbooks/callback?code=fake-auth-code&state=replayed&realmId=${`93414${String(Date.now()).slice(-9)}`}`); await page.waitForURL(/\/owner\/(data|first-run)\?quickbooks=/, { timeout: 60_000 }); return page.url(); })();
      expect(second).toMatch(/quickbooks=(invalid_state|already_consumed|expired|context_mismatch)/);
      expect(await readCounts(email)).toEqual({ connections: 1, active: 1 });
      expect(await counts(email)).toMatchObject({ cycles: 1 });
    });

    test("Journey B2 - owner CLOSES the browser after connecting: the first read still gets made, once, and is waiting on return", async ({ page, baseURL, context }) => {
      const { email } = await signUpAndVerify(page);
      await page.context().clearCookies();
      await login(page, email);
      await page.goto("/owner/first-run", { waitUntil: "networkidle" });
      await completeBusinessStep(page);
      await connectThroughFakeIntuit(page, baseURL!);

      await page.goto("about:blank"); // the owner leaves: no tab polls, nothing runs in a browser
      let n = 0;
      for (let i = 0; i < 60 && n === 0; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        n = (await counts(email)).cycles;
      }
      expect(n, "the first read was produced server-side without any open page").toBe(1);
      await new Promise((r) => setTimeout(r, 8000)); // and nothing makes a second one afterwards
      expect(await counts(email)).toMatchObject({ cycles: 1 });

      const back = await context.newPage();
      await back.goto("/owner/first-run", { waitUntil: "networkidle" });
      await firstReadAssertions(back); // waiting for them: no analysis step, no blank dashboard
    });
  });
});
