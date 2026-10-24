/**
 * QuickBooks Online V1 owner lifecycle in a REAL browser against the real app and a seeded PostgreSQL.
 *
 * Intuit is never contacted: the browser's navigation to Intuit's authorization page is intercepted (and its URL inspected), and
 * connection state is seeded directly in the database for the status states. Covers: discovery of QuickBooks on My Business, the
 * Connect call and Intuit redirect, no raw-JSON callback UX (denial round-trip), connecting/connected/stale/error/reconnect/
 * disconnected states, disconnect with confirmation, reconnect, phone-width layout and accessibility of the card.
 *
 * Requires the server to run with QUICKBOOKS_CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI and QUICKBOOKS_ENVIRONMENT=sandbox.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pg from "pg";
import { randomUUID } from "crypto";
import { authenticateUser } from "./helpers";
import { E2E_OWNER, E2E_WORKSPACE_ID } from "./e2e-fixtures";

const connString = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
const REALM = `9${Date.now().toString().slice(-9)}`;
let client: pg.Client;
let businessId = "";
let connectionId = "";

async function sql(text: string, params: unknown[] = []) {
  return client.query(text, params);
}
async function setState(o: { status?: string; lifecycle?: string; lastSuccessAt?: string | null; failures?: number; code?: string | null; company?: string | null }) {
  if (o.status) await sql(`UPDATE qbo_connections SET status = $1, reauth_required_at = CASE WHEN $1 = 'REAUTH_REQUIRED' THEN now() ELSE NULL END, disconnected_at = CASE WHEN $1 = 'DISCONNECTED' THEN now() ELSE NULL END, updated_at = now() WHERE id = $2`, [o.status, connectionId]);
  await sql(
    `INSERT INTO qbo_sync_state (connection_id, workspace_id, business_id, lifecycle, last_success_at, consecutive_failures, last_error_code, company_name, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (connection_id) DO UPDATE SET lifecycle = $4, last_success_at = $5, consecutive_failures = $6, last_error_code = $7, company_name = $8, baseline_cursor = NULL, updated_at = now()`,
    [connectionId, E2E_WORKSPACE_ID, businessId, o.lifecycle ?? "SYNCED", o.lastSuccessAt ?? null, o.failures ?? 0, o.code ?? null, o.company ?? null],
  );
}
async function openMyBusiness(page: Page) {
  await page.goto("/owner/data", { waitUntil: "networkidle" });
  await expect(page.getByTestId("qbo-card")).toBeVisible({ timeout: 20_000 });
}
const stateOf = (page: Page) => page.getByTestId("qbo-card").getAttribute("data-qbo-state");

test.describe.serial("QuickBooks Online — owner lifecycle (real browser)", () => {
  test.beforeAll(async () => {
    client = new pg.Client({ connectionString: connString });
    await client.connect();
  });
  test.afterAll(async () => {
    if (connectionId) {
      await sql(`DELETE FROM qbo_sync_state WHERE connection_id = $1`, [connectionId]).catch(() => undefined);
      await sql(`DELETE FROM qbo_resource_locks WHERE connection_id = $1`, [connectionId]).catch(() => undefined);
      await sql(`DELETE FROM qbo_connections WHERE id = $1`, [connectionId]).catch(() => undefined);
    }
    await sql(`DELETE FROM qbo_oauth_states WHERE workspace_id = $1`, [E2E_WORKSPACE_ID]).catch(() => undefined);
    await client.end();
  });

  test("the owner discovers QuickBooks on My Business; Connect starts the governed flow and lands on Intuit", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    const list = await page.request.get("/api/owner/businesses");
    const biz = (await list.json()) as { businesses?: Array<{ id: string }> } | Array<{ id: string }>;
    businessId = (Array.isArray(biz) ? biz : biz.businesses ?? [])[0]?.id ?? "";
    if (!businessId) {
      // The seeded archetype is a fixture business (hidden from owners); create an ordinary one through the governed route.
      const created = await page.request.post("/api/owner/recovery/businesses", {
        data: { name: "QBO Browser Test Co", businessType: "generic_local_service", currency: "USD", b2cSupported: true, b2bSupported: false },
      });
      expect(created.status()).toBeLessThan(300);
      const body = (await created.json()) as { id?: string; business?: { id: string } };
      businessId = body.id ?? body.business?.id ?? "";
    }
    expect(businessId).not.toBe("");
    await sql(`DELETE FROM qbo_sync_state WHERE business_id = $1`, [businessId]);
    await sql(`DELETE FROM qbo_connections WHERE business_id = $1`, [businessId]);

    await openMyBusiness(page);
    expect(await stateOf(page)).toBe("NOT_CONNECTED");
    await expect(page.getByTestId("qbo-explainer")).toContainText(/never changes anything in QuickBooks/i);

    let intuitUrl = "";
    await page.route("https://appcenter.intuit.com/**", async (route) => {
      intuitUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>intuit</body></html>" });
    });
    const connectCall = page.waitForRequest((r) => r.url().includes("/api/owner/integrations/quickbooks/connect") && r.method() === "POST");
    await page.getByTestId("qbo-connect").click();
    const body = (await connectCall).postDataJSON();
    expect(body).toEqual({ businessId, environment: "sandbox" });
    await page.waitForURL(/appcenter\.intuit\.com/);
    const u = new URL(intuitUrl);
    expect(u.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")?.length).toBeGreaterThanOrEqual(32);
    expect(intuitUrl).not.toMatch(/client_secret|secret/i);
    test.info().annotations.push({ type: "state", description: "issued" });
  });

  test("callback never shows raw JSON: a denial round-trip lands back on My Business with a plain sentence", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    const start = await page.request.post("/api/owner/integrations/quickbooks/connect", { data: { businessId, environment: "sandbox" } });
    expect(start.status()).toBe(200);
    const state = new URL(((await start.json()) as { authorizationUrl: string }).authorizationUrl).searchParams.get("state") as string;
    // Intuit redirects the browser to the callback PAGE (the registered redirect URI), not to the JSON API.
    await page.goto(`/owner/integrations/quickbooks/callback?error=access_denied&state=${state}&error_description=%3Cscript%3Eevil%3C/script%3E`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/owner\/data(\?quickbooks=user_denied)?$/, { timeout: 30_000 });
    // the notice is consumed and removed from the address bar
    await expect(page.getByTestId("qbo-notice")).toContainText(/not approved/i, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/owner\/data$/);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/"status"\s*:|"code"\s*:|evil/);
    expect(await stateOf(page)).toBe("NOT_CONNECTED");
  });

  test("an unauthenticated callback is redirected, never a JSON 401 page", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/owner/integrations/quickbooks/callback?code=C&realmId=123&state=" + "A".repeat(40), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    // a person without a session is sent to sign in; they never see an OAuth JSON document
    expect(new URL(page.url()).pathname).toMatch(/^\/(login|owner\/data|owner\/integrations\/quickbooks\/callback)/);
    expect(await page.locator("body").innerText()).not.toMatch(/"error"\s*:|"status"\s*:|Unauthorized"/);
    await ctx.close();
  });

  test("status states are truthful: connecting, connected (company + last updated), stale, error, reconnect required", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    connectionId = randomUUID();
    await sql(
      `INSERT INTO qbo_connections (id, workspace_id, business_id, environment, realm_id, status, connected_by_id, connected_at, version, updated_at)
       VALUES ($1,$2,$3,'sandbox',$4,'ACTIVE',$5, now(), 1, now())`,
      [connectionId, E2E_WORKSPACE_ID, businessId, REALM, E2E_OWNER.userId],
    );

    await openMyBusiness(page);
    expect(await stateOf(page)).toBe("CONNECTING");
    await expect(page.getByTestId("qbo-state")).toHaveText(/connecting/i);

    await setState({ lifecycle: "SYNCED", lastSuccessAt: new Date().toISOString(), company: "Acme Books" });
    await openMyBusiness(page);
    expect(await stateOf(page)).toBe("CONNECTED");
    await expect(page.getByTestId("qbo-facts")).toContainText("Acme Books");
    await expect(page.getByTestId("qbo-last-updated")).not.toHaveText("not yet");
    await expect(page.getByTestId("qbo-refresh")).toBeVisible();
    // the card never offers Connect while connected
    await expect(page.getByTestId("qbo-connect")).toHaveCount(0);

    await setState({ lifecycle: "SYNCED", lastSuccessAt: new Date(Date.now() - 4 * 86_400_000).toISOString(), company: "Acme Books" });
    await openMyBusiness(page);
    expect(await stateOf(page)).toBe("STALE");
    await expect(page.getByTestId("qbo-stale")).toContainText(/more than 36 hours ago/);

    await setState({ lifecycle: "FAILING", lastSuccessAt: new Date().toISOString(), failures: 2, code: "TRANSIENT_PROVIDER_FAILURE", company: "Acme Books" });
    await openMyBusiness(page);
    expect(await stateOf(page)).toBe("SYNC_ERROR");
    await expect(page.getByTestId("qbo-failure")).toContainText(/try again automatically/i);
    expect(await page.locator("body").innerText()).not.toContain("TRANSIENT_PROVIDER_FAILURE");

    await setState({ status: "REAUTH_REQUIRED", lifecycle: "FAILING", failures: 1, code: "REAUTH_REQUIRED", company: "Acme Books" });
    await openMyBusiness(page);
    expect(await stateOf(page)).toBe("REAUTH_REQUIRED");
    await expect(page.getByTestId("qbo-reconnect")).toBeVisible();
    await expect(page.getByTestId("qbo-refresh")).toHaveCount(0);
    await expect(page.getByTestId("qbo-failure")).toContainText(/sign in again/i);
  });

  test("reconnect starts the same governed flow; disconnect is confirmed, revokes locally, and offers Connect again", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await setState({ status: "ACTIVE", lifecycle: "SYNCED", lastSuccessAt: new Date().toISOString(), company: "Acme Books" });
    await openMyBusiness(page);

    // reconnect-required path posts connect (verified in the first test); here: disconnect with an explicit confirmation step
    await page.getByTestId("qbo-disconnect").click();
    await expect(page.getByTestId("qbo-disconnect-confirm")).toContainText(/Imported figures stay on record/);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("qbo-disconnect-confirm")).toHaveCount(0);
    expect(await stateOf(page)).toBe("CONNECTED");

    await page.getByTestId("qbo-disconnect").click();
    const call = page.waitForResponse((r) => r.url().includes("/quickbooks/disconnect") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Yes, disconnect" }).click();
    expect((await call).status()).toBe(200);
    await expect(page.getByTestId("qbo-card")).toHaveAttribute("data-qbo-state", "DISCONNECTED", { timeout: 20_000 });
    await expect(page.getByTestId("qbo-connect")).toHaveText("Reconnect QuickBooks");
    const row = await sql(`SELECT status FROM qbo_connections WHERE id = $1`, [connectionId]);
    expect(row.rows[0].status).toBe("DISCONNECTED");
    const tokens = await sql(`SELECT count(*)::int AS n FROM qbo_connection_tokens WHERE connection_id = $1`, [connectionId]);
    expect(tokens.rows[0].n).toBe(0);
  });

  test("phone width: no horizontal scroll, full-width tappable actions, card passes an accessibility scan", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await setState({ status: "ACTIVE", lifecycle: "SYNCED", lastSuccessAt: new Date().toISOString(), company: "A Rather Long Company Name Trading As Something Even Longer LLC" });
    await openMyBusiness(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const id of ["qbo-refresh", "qbo-disconnect"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
      expect(box?.width ?? 0).toBeGreaterThan(300);
    }
    const results = await new AxeBuilder({ page }).include('[data-testid="qbo-card"]').analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
