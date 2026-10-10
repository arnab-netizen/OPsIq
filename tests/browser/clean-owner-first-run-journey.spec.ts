/**
 * CLEAN-OWNER FIRST-RUN JOURNEY — the primary acceptance browser test for the
 * "HUMAN RETEST FAILURE: FIRST-RUN RUNTIME CLOSURE" pass.
 *
 * Walks a genuinely clean workspace (no fixture businesses, no legacy tasks/diagnoses/startup
 * sessions/risks/recommendations) through the full first-run path a real low-digital-literacy
 * owner takes:
 *
 *   signup -> verify (local-only DB shortcut, see local-core-journey.spec.ts for why this is the
 *   safe local test mechanism) -> login -> Start Here -> create first business (My Business,
 *   exercising the same CreateBusinessPanel path P0-1 fixed) -> Home -> Priorities -> Start Work
 *   -> Actions -> Customers -> Operations -> Startup planning -> Account -> Help.
 *
 * Asserts, per page: business creation succeeds and becomes active everywhere (no reload
 * needed); no business-specific recommendation exists before real evidence does; Home and
 * Priorities never disagree about whether something needs attention; no raw internal errors, no
 * raw enums, no UUIDs, no ISO timestamps, no internal-role language, no acceptance/fixture
 * records, and no dead links anywhere in the journey.
 *
 * SAFETY: refuses to run against anything that is not an explicit localhost DB, same guard as
 * local-core-journey.spec.ts and scripts/smoke-owner-recovery-runtime.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { resolveTestDatabase } from "../../src/infra/test-database-guard";
import { Client } from "pg";
import { randomUUID } from "crypto";
import { completeFirstRunBusinessStep } from "./first-run-helpers";

const DATABASE_URL = process.env.DATABASE_URL || "";
// Same guard as the vitest harness (a substring regex could be satisfied by "?x=@localhost:" or a
// "?host=" override while the driver connects elsewhere).
const isLocal = (() => {
  try {
    return resolveTestDatabase({ ...process.env, TEST_WITH_DB: "true", DATABASE_URL }).target === "loopback";
  } catch {
    return false;
  }
})();

const RAW_TOKEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "raw UUID", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { label: "raw ISO timestamp", pattern: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/ },
  { label: "PROPOSED enum", pattern: /\bPROPOSED\b/ },
  { label: "Internal server error", pattern: /internal server error/i },
  { label: "Prisma/SQL leakage", pattern: /prisma|postgresql|stack trace/i },
  { label: "internal-role language as primary identity", pattern: /Admin \/ Portfolio Mgr/ },
];

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

function assertNoRawTokens(text: string, pageLabel: string) {
  for (const { label, pattern } of RAW_TOKEN_PATTERNS) {
    expect(text, `${pageLabel} must not render "${label}"`).not.toMatch(pattern);
  }
}

async function assertNoDeadLinks(page: Page, selector = "main a") {
  for (const link of await page.locator(selector).all()) {
    if (!(await link.isVisible())) continue;
    const href = await link.getAttribute("href");
    expect(href, "every visible link must have a real href").toBeTruthy();
  }
}

test.describe("Clean-owner first-run journey", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");

  const rand = randomUUID().slice(0, 8);
  const email = `clean-owner-${rand}@example.com`;
  const password = "correct-horse-battery-staple";
  const workspaceName = `Clean Owner Workspace ${rand}`;

  test("signup, create first business, and complete the first-run journey", async ({ page }) => {
    // ── Signup ──
    await page.goto("/signup", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Business name", { exact: true }).fill(workspaceName);
    for (const cb of await page.locator('input[type="checkbox"]').all()) {
      if (!(await cb.isChecked())) await cb.check();
    }
    const [signupResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/signup") && r.request().method() === "POST"),
      page.click('button[type="submit"]'),
    ]);
    expect(signupResponse.status(), "signup must succeed").toBe(201);

    // ── Verify (local DB shortcut — no email provider configured in local dev) ──
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query("UPDATE users SET email_verified_at = now() WHERE email = $1 RETURNING id", [email]);
      expect(result.rowCount).toBe(1);
    } finally {
      await client.end();
    }

    // ── Login ──
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner/, { timeout: 15000 });

    // ── Zero-business Home: no business exists yet, so no business-specific recommendation may
    // appear (P0-3) -- only the onboarding empty state. ──
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    let text = await bodyText(page);
    expect(text, "Home must not show business-specific guidance before any business exists").toMatch(
      /Set up your business to get your first assessment/
    );
    expect(text).not.toMatch(/cash survival|protect cash runway|do not hire|do not discount/i);
    assertNoRawTokens(text, "Home (zero business)");

    // ── Start Here ──
    await page.goto("/owner/start-here", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Start Here" })).toBeVisible();
    assertNoRawTokens(await bodyText(page), "Start Here");
    await assertNoDeadLinks(page);

    // ── Create the first business through first-run: the name typed at signup is inherited (never re-asked) ──
    await completeFirstRunBusinessStep(page, { currency: "INR" });
    await expect(page.getByText(workspaceName).first()).toBeVisible({ timeout: 10000 });
    expect(await page.locator('input[name="name"]').count(), "the business name must not be asked a second time").toBe(0);

    // ── Business must be visible/active on Home in the SAME session, no reload (P0-1 root cause) ──
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    text = await bodyText(page);
    expect(text, "Home must reflect the just-created business without a page reload").not.toMatch(
      /Set up your business to get your first assessment/
    );
    assertNoRawTokens(text, "Home (business active)");
    await assertNoDeadLinks(page);

    // ── Priorities must never disagree with Home (P0-4): if Home has an actionable top
    // priority, Priorities cannot claim nothing needs attention. ──
    const homeHasPriority = /YOUR TOP PRIORITY NOW/i.test(text);
    await page.goto("/owner/priorities", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Priorities");
    if (homeHasPriority) {
      expect(text, "Priorities must not claim nothing needs attention while Home shows a top priority").not.toMatch(
        /Nothing needs your attention right now/
      );
    }
    await assertNoDeadLinks(page);

    // ── Start Work, if an actionable item exists — must never surface a raw error ──
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    const startWorkBtn = page.getByRole("button", { name: "Start Work" }).first();
    if ((await startWorkBtn.count()) > 0) {
      await startWorkBtn.click();
      await page.waitForTimeout(1500);
      text = await bodyText(page);
      assertNoRawTokens(text, "Home (after Start Work)");
      expect(text, "Start Work must never surface a raw/ungoverned failure").not.toMatch(
        /We couldn't start this action/i
      );
    }

    // ── Actions ──
    await page.goto("/owner/tasks", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Actions");
    await assertNoDeadLinks(page);

    // ── Customers ──
    await page.goto("/owner/customers", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Customers");
    await assertNoDeadLinks(page);

    // ── Operations ──
    await page.goto("/owner/operations", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Operations");
    await assertNoDeadLinks(page);

    // ── Startup planning: a fresh workspace must never show acceptance/QA fixture sessions
    // (P0-5) -- an ordinary owner's own list starts genuinely empty. ──
    await page.goto("/owner/startup", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Startup planning");
    expect(text, "a clean workspace must show no acceptance/QA startup sessions").not.toMatch(
      /OPsIQ Production Acceptance|OPSIQ Production Acceptance/i
    );
    await assertNoDeadLinks(page);

    // ── Account (P1): a self-serve owner sees "Business owner", never the internal role
    // taxonomy as their primary identity. ──
    await page.goto("/settings", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Account");
    expect(text, "a self-serve owner's Account page must show a plain account type").toMatch(/Account type/);
    expect(text).toMatch(/Business owner/);
    await assertNoDeadLinks(page);

    // ── Help ──
    await page.goto("/owner/help", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
    assertNoRawTokens(await bodyText(page), "Help");
    await assertNoDeadLinks(page);
  });
});
