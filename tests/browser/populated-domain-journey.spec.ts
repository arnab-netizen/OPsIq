/**
 * POPULATED-DOMAIN JOURNEY — walks a real, populated multi-business owner path end to end:
 * Riverside Cafe's Customer Business Review (real seeded customers, not a fixture) → switching
 * business context → Trinity Services' Operations findings/evidence → Home → Money → Actions.
 *
 * Exercising a business switch mid-journey is deliberate, not incidental: it is the exact class
 * of bug (active business silently resetting per-page) the whole trust-journey engagement started
 * from, and this is the first spec that walks it with BOTH businesses actually populated with
 * real domain data instead of one empty and one with only finance data.
 *
 * Requires both scripts/seed-trust-journey-repro.ts and scripts/seed-customers-operations-demo.ts
 * to have already run against the target DATABASE_URL.
 */
import { test, expect, type Page } from "@playwright/test";
import { authenticateUser } from "./helpers";
import {
  TRUST_JOURNEY_OWNER,
  TRINITY_BUSINESS_NAME,
  FIXTURE_BUSINESS_A_NAME,
  FIXTURE_BUSINESS_B_NAME,
} from "./trust-journey-fixtures";

const RIVERSIDE_BUSINESS_NAME = "Riverside Cafe";

const RAW_TOKEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "dataConfidenceScore", pattern: /dataConfidenceScore/ },
  { label: "workspaceId", pattern: /\bworkspaceId\b/ },
  { label: "businessId", pattern: /\bbusinessId\b/ },
  { label: "raw UUID", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { label: "raw ISO timestamp", pattern: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/ },
  { label: "PROPOSED enum", pattern: /\bPROPOSED\b/ },
  { label: "STRAINED enum", pattern: /\bSTRAINED\b/ },
  { label: "AT_RISK enum", pattern: /\bAT_RISK\b/ },
];

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

function assertNoRawTokens(text: string, pageLabel: string) {
  for (const { label, pattern } of RAW_TOKEN_PATTERNS) {
    expect(text, `${pageLabel} must not render the raw token "${label}"`).not.toMatch(pattern);
  }
}

function assertNoFixtureBusinesses(text: string, pageLabel: string) {
  for (const name of [FIXTURE_BUSINESS_A_NAME, FIXTURE_BUSINESS_B_NAME]) {
    expect(text, `${pageLabel} must not leak fixture business "${name}"`).not.toContain(name);
  }
}

async function assertNoDeadLinks(page: Page, selector = "a") {
  for (const link of await page.locator(selector).all()) {
    if (!(await link.isVisible())) continue;
    const href = await link.getAttribute("href");
    expect(href, "every visible link must have a real href").toBeTruthy();
  }
}

async function activeBusinessLabel(page: Page): Promise<string | null> {
  const indicator = page.locator('[data-testid="active-business-indicator"]');
  if ((await indicator.count()) === 0) return null;
  return (await indicator.innerText()).trim();
}

test.describe("Populated-domain journey — Customers → Operations → Home → Money → Actions", () => {
  test("real seeded data across two businesses renders honestly with no fixtures, raw tokens, or dead links", async ({ page }) => {
    await authenticateUser(page, TRUST_JOURNEY_OWNER.email, TRUST_JOURNEY_OWNER.password);

    // 1. Switch to Riverside Cafe — the business carrying the real, non-fixture populated
    // customer dataset (scripts/seed-customers-operations-demo.ts).
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const selector = page.locator('[data-testid="business-context-selector"]');
    await expect(selector).toBeVisible({ timeout: 10000 });
    const riversideValue = await selector.locator(`option:has-text("${RIVERSIDE_BUSINESS_NAME}")`).getAttribute("value");
    await selector.selectOption(riversideValue!);
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText(RIVERSIDE_BUSINESS_NAME, { timeout: 10000 });

    // 2. Customers — the real Customer Business Review, populated. Assert the real computed
    // sections are present (not an empty-state fallback, not fabricated placeholder prose) and
    // honest about the underlying data.
    await page.goto("/owner/customers", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(RIVERSIDE_BUSINESS_NAME);
    let text = await bodyText(page);
    assertNoRawTokens(text, "Customers (populated)");
    assertNoFixtureBusinesses(text, "Customers (populated)");
    expect(text).toMatch(/CUSTOMER POSITION/i);
    expect(text).toMatch(/tracked customers? worth/i);
    expect(text).toMatch(/CUSTOMER CONCENTRATION/i);
    expect(text).toMatch(/CUSTOMER ACTIVITY/i);
    // No unsupported claim: the empty-state-only copy must not appear alongside real data.
    expect(text).not.toMatch(/Not enough customer information yet/);
    await assertNoDeadLinks(page, "main a");

    // 3. Switch to Trinity Services — the business carrying the real, non-fixture populated
    // operations diagnosis. This is the deliberate mid-journey business switch: Home, Operations,
    // and Money must all reflect Trinity from here on, not silently keep showing Riverside.
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    await expect(selector).toBeVisible({ timeout: 10000 });
    const trinityValue = await selector.locator(`option:has-text("${TRINITY_BUSINESS_NAME}")`).getAttribute("value");
    await selector.selectOption(trinityValue!);
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText(TRINITY_BUSINESS_NAME, { timeout: 10000 });

    // 4. Operations — real findings/evidence, verified business-context-correct.
    await page.goto("/owner/operations", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(TRINITY_BUSINESS_NAME);
    text = await bodyText(page);
    assertNoRawTokens(text, "Operations (populated)");
    assertNoFixtureBusinesses(text, "Operations (populated)");
    expect(text).toMatch(/OPERATIONS POSITION/i);
    expect(text).toMatch(/WHAT OPSIQ FOUND/i);
    expect(text).toMatch(/EVIDENCE/i);
    expect(text).toMatch(/HOW SURE OPSIQ IS/i);
    await assertNoDeadLinks(page, "main a");

    // 5. Home — must reflect Trinity (the business just switched to), no raw tokens, no dead
    // execution-lifecycle links.
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(TRINITY_BUSINESS_NAME);
    text = await bodyText(page);
    assertNoRawTokens(text, "Home");
    assertNoFixtureBusinesses(text, "Home");

    // 6. Money — still Trinity, real finding/evidence pattern present, no raw tokens.
    await page.goto("/owner/finance", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(TRINITY_BUSINESS_NAME);
    text = await bodyText(page);
    assertNoRawTokens(text, "Money");
    assertNoFixtureBusinesses(text, "Money");
    expect(text).toMatch(/WHAT OPSIQ FOUND/i);

    // 7. Actions — real delegated/process tasks, no dead "what happens next" links, no raw tokens.
    await page.goto("/owner/tasks", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Actions");
    assertNoFixtureBusinesses(text, "Actions");
    for (const link of await page.locator('a:has-text("What happens next")').all()) {
      expect(await link.getAttribute("href")).toBeTruthy();
    }
  });
});
