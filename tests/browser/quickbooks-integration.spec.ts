/**
 * QuickBooks Online owner integration — real browser, real dev/prod server, real local Postgres.
 *
 * Proves, end to end through the UI and the real routes (no mocked API):
 *  1. The Integrations page renders the QuickBooks card (not connected) from the real DTO.
 *  2. Connect sends the browser to Intuit's authorize endpoint with the right parameters;
 *     the state sent to Intuit is stored only as its SHA-256 hash (never in clear).
 *  3. A forged callback state is rejected with an owner-friendly message; the real state is
 *     single-use (a replay of the same callback is rejected too).
 *  4. A connected company renders company / sandbox badge / status / Sync Now / Disconnect,
 *     with no token material anywhere in the page or API responses.
 *  5. Sync Now is accepted (202) and the page never shows a token or crashes.
 *  6. Disconnect requires confirmation, deletes the token row and leaves Reconnect.
 *  7. Axe accessibility scan passes on the card; the page works at mobile width.
 *
 * Intuit itself is never contacted by the browser: the authorize URL is intercepted.
 *
 * Server requirements (set on the app process): QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
 * QUICKBOOKS_REDIRECT_URI=<BASE_URL>/api/owner/integrations/quickbooks/callback,
 * QUICKBOOKS_ENVIRONMENT=sandbox, OAUTH_TOKEN_ENCRYPTION_KEY (same value exported to this test).
 * SAFETY: refuses to run except against an explicit local Postgres DATABASE_URL.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { randomUUID, createHash } from "crypto";
import * as bcrypt from "bcryptjs";
import { encryptOAuthToken } from "../../src/services/external-systems/oauth-token.service";

const DATABASE_URL = process.env.DATABASE_URL || "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL) && !/neon\.tech|amazonaws|\.aws\./.test(DATABASE_URL);
const configured = !!process.env.QUICKBOOKS_CLIENT_ID && !!process.env.OAUTH_TOKEN_ENCRYPTION_KEY;

const RUN = randomUUID().slice(0, 8);
const USER_ID = randomUUID();
const WORKSPACE_ID = randomUUID();
const BUSINESS_ID = randomUUID();
const EMAIL = `qbo-e2e-${RUN}@example.com`;
const PASSWORD = "qbo-e2e-password-123";
const REALM = "9130357000000001";
const ACCESS = `e2e-access-${RUN}-SECRET`;
const REFRESH = `e2e-refresh-${RUN}-SECRET`;

async function sql<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.configure({ mode: "serial" });

test.describe("QuickBooks Online integration (owner, real backend)", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.skip(!configured, "Server must be started with QuickBooks sandbox app env + OAUTH_TOKEN_ENCRYPTION_KEY.");

  const consoleErrors: string[] = [];
  const apiBodies: string[] = [];
  const failedResponses: string[] = [];

  test.beforeAll(async () => {
    const hash = bcrypt.hashSync(PASSWORD, 10);
    await sql(
      `INSERT INTO users (id, email, name, hashed_password, updated_at, email_verified_at) VALUES ($1,$2,'QBO E2E Owner',$3,now(),now())`,
      [USER_ID, EMAIL, hash],
    );
    await sql(`INSERT INTO workspaces (id, name, slug, created_by, description) VALUES ($1,$2,$3,$4,'qbo e2e')`, [
      WORKSPACE_ID, `QBO E2E ${RUN}`, `qbo-e2e-${RUN}`, USER_ID,
    ]);
    await sql(`INSERT INTO workspace_memberships (workspace_id, user_id, role, added_by, is_active) VALUES ($1,$2,'owner',$2,true)`, [
      WORKSPACE_ID, USER_ID,
    ]);
    await sql(
      `INSERT INTO user_role_assignments (id, user_id, role, scope, scope_id, is_active) VALUES ($1,$2,'admin_or_portfolio_manager','workspace',$3,true)`,
      [randomUUID(), USER_ID, WORKSPACE_ID],
    );
    await sql(
      `INSERT INTO owner_businesses (id, workspace_id, name, business_type, currency, created_by, updated_at) VALUES ($1,$2,'QBO E2E Bakery','generic_local_service','USD',$3,now())`,
      [BUSINESS_ID, WORKSPACE_ID, USER_ID],
    );
  });

  test.beforeEach(async ({ page }) => {
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("response", async (r) => {
      if (r.status() >= 400) failedResponses.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`);
      if (new URL(r.url()).pathname.startsWith("/api/owner/integrations/quickbooks")) {
        apiBodies.push(await r.text().catch(() => ""));
      }
    });
    // Never let the browser reach Intuit: answer the consent page locally.
    await page.route("https://appcenter.intuit.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Intuit consent (stubbed)</body></html>" }),
    );
  });

  test("not connected → Connect sends the owner to Intuit with a hashed one-time state", async ({ page }) => {
    await login(page);
    await page.goto("/owner/integrations", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading").first().waitFor();
    await expect(page.getByRole("heading", { name: /integrations/i }).first()).toBeVisible();
    await expect(page.getByText("QuickBooks Online").first()).toBeVisible();

    const select = page.locator("select").first();
    if (await select.isVisible()) await select.selectOption({ label: "QBO E2E Bakery" }).catch(() => select.selectOption(BUSINESS_ID));
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().startsWith("https://appcenter.intuit.com/connect/oauth2")),
      page.getByRole("button", { name: /^connect/i }).click(),
    ]);
    const url = new URL(req.url());
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(url.searchParams.get("client_id")).toBe(process.env.QUICKBOOKS_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.QUICKBOOKS_REDIRECT_URI);
    const state = url.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(40);

    const [row] = await sql<{ oauth_state_hash: string; business_id: string; status: string }>(
      `SELECT oauth_state_hash, business_id, status FROM owner_connectors WHERE workspace_id=$1 AND provider='QUICKBOOKS'`,
      [WORKSPACE_ID],
    );
    expect(row.oauth_state_hash).toBe(createHash("sha256").update(state).digest("hex"));
    expect(row.oauth_state_hash).not.toBe(state);
    expect(row.business_id).toBe(BUSINESS_ID);
    expect(row.status).toBe("PENDING_AUTH");
    // Serial tests share one worker process; carry the real state to the next test.
    process.env.__QBO_E2E_STATE = state;
  });

  test("forged callback state is rejected; the real state is single-use", async ({ page }) => {
    await login(page);
    await page.goto(`/api/owner/integrations/quickbooks/callback?code=forged&state=${"a".repeat(43)}&realmId=${REALM}`);
    await page.waitForURL(/\/owner\/integrations/);
    await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /start|again|expired|link/i }).first()).toBeVisible();

    // Real state + a code Intuit will not accept: state is consumed, exchange fails safely.
    const state = process.env.__QBO_E2E_STATE!;
    await page.goto(`/api/owner/integrations/quickbooks/callback?code=not-a-real-code&state=${state}&realmId=${REALM}`);
    await page.waitForURL(/\/owner\/integrations/);
    const [afterExchange] = await sql<{ oauth_state_hash: string | null; status: string; external_account_id: string | null }>(
      `SELECT oauth_state_hash, status, external_account_id FROM owner_connectors WHERE workspace_id=$1 AND provider='QUICKBOOKS'`,
      [WORKSPACE_ID],
    );
    expect(afterExchange.oauth_state_hash).toBeNull(); // consumed exactly once
    expect(afterExchange.status).not.toBe("ACTIVE"); // a failed exchange never binds a realm
    expect(afterExchange.external_account_id).toBeNull();

    // Replay of the same (consumed) state → invalid.
    await page.goto(`/api/owner/integrations/quickbooks/callback?code=not-a-real-code&state=${state}&realmId=${REALM}`);
    await page.waitForURL(/\/owner\/integrations/);
    await expect(page.locator("body")).not.toContainText(state);
  });

  test("connected company renders status and actions without leaking tokens", async ({ page }) => {
    const enc = encryptOAuthToken({ accessToken: ACCESS, refreshToken: REFRESH, tokenType: "bearer", expiresAt: new Date(Date.now() + 3600_000) }, WORKSPACE_ID);
    await sql(
      `UPDATE owner_connectors SET status='ACTIVE', external_account_id=$2, external_account_name='Sandbox Company US', environment='sandbox',
         last_sync_at=now() - interval '2 hours', last_sync_records=128, token_expires_at=now() + interval '1 hour',
         sync_state=$3::jsonb WHERE workspace_id=$1 AND provider='QUICKBOOKS'`,
      [WORKSPACE_ID, REALM, JSON.stringify({
        version: 1, phase: "INCREMENTAL",
        initial: { entityIndex: 22, startPosition: 1, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        cdcCursor: new Date().toISOString(), lastRunId: "e2e", lastRunAt: new Date().toISOString(), lastRunStatus: "SUCCESS",
        lastRunSummary: "Synced 128 records", lastReportsAt: null, lastMaterializedPeriod: null, recordCounts: {},
      })],
    );
    await sql(
      `INSERT INTO owner_connector_tokens (connector_id, encrypted_access_token, encrypted_refresh_token, token_type, updated_at, refresh_token_expires_at, version)
       SELECT id, $2, $3, 'bearer', now(), now() + interval '90 days', 1 FROM owner_connectors WHERE workspace_id=$1 AND provider='QUICKBOOKS'`,
      [WORKSPACE_ID, enc.accessToken, enc.refreshToken],
    );

    await login(page);
    await page.goto("/owner/integrations", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading").first().waitFor();
    await expect(page.getByText("Sandbox Company US")).toBeVisible();
    await expect(page.getByText(/sandbox/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sync now/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /disconnect/i })).toBeVisible();

    const html = await page.content();
    for (const secret of [ACCESS, REFRESH, enc.accessToken, REALM]) expect(html).not.toContain(secret);

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => v.id)).toEqual([]);
  });

  test("Sync Now is accepted and the page stays healthy", async ({ page }) => {
    await login(page);
    await page.goto("/owner/integrations", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading").first().waitFor();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/owner/integrations/quickbooks") && r.request().method() === "POST"),
      page.getByRole("button", { name: /sync now/i }).click(),
    ]);
    expect(res.status()).toBe(202);
    const tasks = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM scheduled_tasks WHERE workspace_id=$1 AND task_name='quickbooks-sync'`, [WORKSPACE_ID]);
    expect(Number(tasks[0].n)).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(3000);
    expect(await page.content()).not.toContain(ACCESS);
  });

  test("record write buttons follow server-decided allowedActions; confirmation and error UX", async ({ page }) => {
    const [conn] = await sql<{ id: string }>(`SELECT id FROM owner_connectors WHERE workspace_id=$1 AND provider='QUICKBOOKS'`, [WORKSPACE_ID]);
    const mirror = (entityType: string, remoteId: string, data: object, link: [string, string] | null = null) =>
      sql(
        `INSERT INTO owner_connector_records (workspace_id, business_id, connector_id, provider, external_account, entity_type, remote_id, remote_sync_token, remote_status, data, opsiq_entity_type, opsiq_entity_id, updated_at)
         VALUES ($1,$2,$3,'QUICKBOOKS',$4,$5,$6,'0','ACTIVE',$7::jsonb,$8,$9,now())`,
        [WORKSPACE_ID, BUSINESS_ID, conn.id, REALM, entityType, remoteId, JSON.stringify(data), link?.[0] ?? null, link?.[1] ?? null],
      );
    const approvedVendor = randomUUID();
    const pendingVendor = randomUUID();
    await sql(`INSERT INTO vendor_records (id, workspace_id, business_id, name, approval_status, updated_at) VALUES ($1,$2,$3,'Linked Flour Co','APPROVED',now()), ($4,$2,$3,'Pending Sugar Co','PENDING_REVIEW',now())`,
      [approvedVendor, WORKSPACE_ID, BUSINESS_ID, pendingVendor]);
    await mirror("Preferences", "preferences", { CurrencyPrefs: { HomeCurrency: { value: "USD" }, MultiCurrencyEnabled: false } });
    await mirror("Account", "60", { Id: "60", Name: "Supplies", AccountType: "Expense", Active: true });
    await mirror("Vendor", "77", { Id: "77", DisplayName: "Linked Flour Co", Active: true }, ["VendorRecord", approvedVendor]);
    await sql(
      `INSERT INTO purchase_orders (workspace_id, business_id, po_number, vendor_id, status, line_items, total_amount, currency, created_by, delivered_at, updated_at)
       VALUES ($1,$2,'PO-E2E-1',$3,'DELIVERED',$4::jsonb,30,'USD',$5,now(),now())`,
      [WORKSPACE_ID, BUSINESS_ID, approvedVendor, JSON.stringify([{ description: "Flour", qty: 3, unitPrice: 10 }]), USER_ID],
    );

    await login(page);
    await page.goto("/owner/vendor", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading").first().waitFor();
    const pendingRow = page.locator("tr", { hasText: "Pending Sugar Co" });
    await expect(pendingRow).toContainText(/approve the vendor/i);
    await expect(pendingRow.getByRole("button", { name: /send to quickbooks/i })).toHaveCount(0);
    await expect(page.locator("tr", { hasText: "Linked Flour Co" })).toContainText(/in quickbooks/i);

    const actionPosts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/owner/integrations/quickbooks/actions")) actionPosts.push(r.postData() ?? "");
    });
    await page.goto("/owner/procurement", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading").first().waitFor();
    const poRow = page.locator("tr", { hasText: "PO-E2E-1" });
    await poRow.getByRole("button", { name: /record bill/i }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/create a bill \(a payable\) in QuickBooks/i);
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();
    expect(actionPosts).toHaveLength(0);

    await poRow.getByRole("button", { name: /record bill/i }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/expense account/i).selectOption("60");
    await dialog.getByRole("button", { name: /record bill/i }).click();
    // Intuit is not reachable with fake credentials: the owner must see an owner-safe error, never secrets.
    const alert = page.getByRole("alert").first();
    await expect(alert).toBeVisible({ timeout: 45000 });
    const alertText = await alert.innerText();
    for (const secret of [ACCESS, REFRESH]) expect(alertText).not.toContain(secret);
    expect(alertText).not.toMatch(/stack|prisma|ECONN|at \w+ \(/i);
    expect(actionPosts).toHaveLength(1);
    expect(JSON.parse(actionPosts[0])).toMatchObject({ action: "record_bill", expenseAccountId: "60", confirm: true });
    const bills = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM owner_connector_records WHERE workspace_id=$1 AND entity_type='Bill'`, [WORKSPACE_ID]);
    expect(bills[0].n).toBe("0"); // nothing recorded without a confirmed QuickBooks commit
  });

  test("Disconnect requires confirmation, deletes the token, leaves Reconnect", async ({ page }) => {
    await login(page);
    await page.goto("/owner/integrations", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading").first().waitFor();
    await page.getByRole("button", { name: /disconnect/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();
    let [tok] = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM owner_connector_tokens t JOIN owner_connectors c ON c.id=t.connector_id WHERE c.workspace_id=$1`, [WORKSPACE_ID]);
    expect(tok.n).toBe("1");

    await page.getByRole("button", { name: /disconnect/i }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /disconnect/i }).click();
    await expect(page.getByRole("button", { name: /reconnect/i })).toBeVisible({ timeout: 15000 });
    [tok] = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM owner_connector_tokens t JOIN owner_connectors c ON c.id=t.connector_id WHERE c.workspace_id=$1`, [WORKSPACE_ID]);
    expect(tok.n).toBe("0");
    const [c] = await sql<{ status: string }>(`SELECT status FROM owner_connectors WHERE workspace_id=$1`, [WORKSPACE_ID]);
    expect(c.status).toBe("DISCONNECTED");
  });

  test("mobile width renders the card without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page);
    await page.goto("/owner/integrations", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading").first().waitFor();
    await expect(page.getByRole("heading", { name: "QuickBooks Online" })).toBeVisible();
    await expect(page.getByRole("button", { name: /reconnect quickbooks/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("no token material in any QuickBooks API response; no console errors", async () => {
    for (const body of apiBodies) {
      for (const secret of [ACCESS, REFRESH]) expect(body).not.toContain(secret);
      // No token-VALUE keys (refreshTokenExpiresAt is a date and is allowed).
      expect(body).not.toMatch(/"(access_?token|refresh_?token|encrypted_?access_?token|encrypted_?refresh_?token|id_token)"\s*:/i);
      expect(body).not.toMatch(/v1gcm\./); // no ciphertext either
    }
    // The ONLY failed request allowed is the deliberately induced Record-bill attempt
    // (Intuit is unreachable with fake credentials); the browser logs one generic
    // "Failed to load resource" line per failed request, and nothing else may appear.
    expect(failedResponses.every((f) => f.startsWith("POST /api/owner/integrations/quickbooks/actions "))).toBe(true);
    expect(failedResponses.length).toBe(1);
    const unexpected = consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e) && !/^Failed to load resource: the server responded with a status of 4\d\d/.test(e));
    expect(unexpected).toEqual([]);
    expect(consoleErrors.filter((e) => /^Failed to load resource/.test(e)).length).toBe(failedResponses.length);
  });
});
