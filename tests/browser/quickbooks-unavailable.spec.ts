/**
 * QuickBooks Online — truthful unavailable state (no Intuit credentials on the server).
 *
 * Run against an app process started WITHOUT QUICKBOOKS_* credentials. Proves the
 * Integrations page renders, says QuickBooks is not configured, offers no Connect button
 * and shows no fabricated status; record pages render no QuickBooks controls; no console
 * errors. SAFETY: refuses to run except against an explicit local Postgres DATABASE_URL.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL || "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL) && !/neon\.tech|amazonaws|\.aws\./.test(DATABASE_URL);
const unconfigured = !process.env.QUICKBOOKS_CLIENT_ID;

const RUN = randomUUID().slice(0, 8);
const USER_ID = randomUUID();
const WORKSPACE_ID = randomUUID();
const EMAIL = `qbo-unavail-${RUN}@example.com`;
const PASSWORD = "qbo-unavail-password-123";

async function sql(text: string, params: unknown[] = []) {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

test.describe("QuickBooks Online — unavailable without credentials", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.skip(!unconfigured, "Requires a server started without QuickBooks credentials.");

  test.beforeAll(async () => {
    await sql(`INSERT INTO users (id, email, name, hashed_password, updated_at, email_verified_at) VALUES ($1,$2,'QBO Unavailable Owner',$3,now(),now())`,
      [USER_ID, EMAIL, bcrypt.hashSync(PASSWORD, 10)]);
    await sql(`INSERT INTO workspaces (id, name, slug, created_by, description) VALUES ($1,$2,$3,$4,'qbo unavailable e2e')`,
      [WORKSPACE_ID, `QBO Unavail ${RUN}`, `qbo-unavail-${RUN}`, USER_ID]);
    await sql(`INSERT INTO workspace_memberships (workspace_id, user_id, role, added_by, is_active) VALUES ($1,$2,'owner',$2,true)`, [WORKSPACE_ID, USER_ID]);
    await sql(`INSERT INTO user_role_assignments (id, user_id, role, scope, scope_id, is_active) VALUES ($1,$2,'admin_or_portfolio_manager','workspace',$3,true)`,
      [randomUUID(), USER_ID, WORKSPACE_ID]);
    await sql(`INSERT INTO owner_businesses (id, workspace_id, name, business_type, currency, created_by, updated_at) VALUES ($1,$2,'Unavailable Bakery','generic_local_service','USD',$3,now())`,
      [randomUUID(), WORKSPACE_ID, USER_ID]);
  });

  test("integrations page is truthful: not configured, no Connect, no fake status", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

    await page.goto("/owner/integrations", { waitUntil: "networkidle" });
    await expect(page.getByText("QuickBooks Online").first()).toBeVisible();
    await expect(page.locator("main")).toContainText(/not configured/i);
    await expect(page.getByRole("button", { name: /^connect|reconnect|sync now|disconnect/i })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/last sync|connected to|active/i);

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

    await page.goto("/owner/vendor", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /send to quickbooks|record bill/i })).toHaveCount(0);

    expect(errors.filter((e) => !/favicon|Download the React DevTools/i.test(e))).toEqual([]);
  });
});
