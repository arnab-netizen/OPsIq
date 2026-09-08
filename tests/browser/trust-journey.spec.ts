/**
 * TRUST JOURNEY — regression coverage for the real human-usability-test failure.
 *
 * A real lay-user test found: selecting a business on My Business did not persist to Money /
 * Customers / Operations; Home contradicted Finance's own SAFE diagnosis; Home asserted
 * "customers aren't coming back" when Customers itself said "no customers yet"; and the business
 * selector was polluted with acceptance/QA fixture businesses.
 *
 * This spec drives the seeded repro workspace (scripts/seed-trust-journey-repro.ts) through the
 * exact journey the human tester took and asserts the fixes hold:
 *   - selecting Trinity Services on My Business persists across every other owner page
 *     (no route transition silently resets to businesses[0]);
 *   - acceptance/QA fixture businesses never appear in the ordinary owner's business selector;
 *   - no page (including Priorities/Tasks) surfaces the fixture businesses' names;
 *   - no page renders a raw internal token (dataConfidenceScore, workspaceId, businessId,
 *     startup_*, or a raw status enum) to the owner;
 *   - Home does not contradict Trinity's genuinely SAFE finance diagnosis.
 *
 * Requires the seed to have already run against the target DATABASE_URL:
 *   DATABASE_URL=... npx tsx scripts/seed-trust-journey-repro.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { authenticateUser } from "./helpers";
import {
  TRUST_JOURNEY_OWNER,
  TRINITY_BUSINESS_NAME,
  FIXTURE_BUSINESS_A_NAME,
  FIXTURE_BUSINESS_B_NAME,
} from "./trust-journey-fixtures";

const RAW_TOKEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "dataConfidenceScore", pattern: /dataConfidenceScore/ },
  { label: "workspaceId", pattern: /\bworkspaceId\b/ },
  { label: "businessId", pattern: /\bbusinessId\b/ },
  { label: "startup_* internal id", pattern: /\bstartup_[a-z0-9]/i },
  { label: "PROPOSED enum", pattern: /\bPROPOSED\b/ },
  { label: "ACKNOWLEDGED enum", pattern: /\bACKNOWLEDGED\b/ },
  { label: "IN_PROGRESS enum", pattern: /\bIN_PROGRESS\b/ },
  { label: "NEEDS_DATA enum", pattern: /\bNEEDS_DATA\b/ },
];

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

function assertNoRawTokens(text: string, pageLabel: string) {
  for (const { label, pattern } of RAW_TOKEN_PATTERNS) {
    expect(text, `${pageLabel} must not render the raw token "${label}"`).not.toMatch(pattern);
  }
}

async function activeBusinessLabel(page: Page): Promise<string | null> {
  const indicator = page.locator('[data-testid="active-business-indicator"]');
  if ((await indicator.count()) === 0) return null;
  return (await indicator.innerText()).trim();
}

test.describe("Trust journey — global business context + fixture isolation + honest signals", () => {
  test("selecting Trinity Services persists across every owner page and never leaks fixtures/raw tokens", async ({ page }) => {
    await authenticateUser(page, TRUST_JOURNEY_OWNER.email, TRUST_JOURNEY_OWNER.password);

    // 1. My Business — select Trinity Services explicitly. The seeded workspace has two REAL
    // businesses (Trinity Services, Riverside Cafe) plus two acceptance/QA fixtures, so the
    // selector must render as an interactive dropdown with exactly the two real businesses —
    // proving fixture isolation holds even when there IS a genuine choice to make (not just when
    // fixture-exclusion happens to leave a single business and no selector at all).
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const selector = page.locator('[data-testid="business-context-selector"]');
    await expect(selector).toBeVisible({ timeout: 10000 });

    // Fixture isolation: the ordinary owner's selector must never list acceptance/QA fixtures.
    const optionTexts = await selector.locator("option").allInnerTexts();
    for (const name of [FIXTURE_BUSINESS_A_NAME, FIXTURE_BUSINESS_B_NAME]) {
      expect(optionTexts.join(" | ")).not.toContain(name);
    }
    expect(optionTexts.join(" | ")).toContain(TRINITY_BUSINESS_NAME);
    expect(optionTexts).toHaveLength(2);

    const trinityOptionValue = await selector.locator(`option:has-text("${TRINITY_BUSINESS_NAME}")`).getAttribute("value");
    await selector.selectOption(trinityOptionValue!);
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText(TRINITY_BUSINESS_NAME, { timeout: 10000 });

    // 2. Money — must already be on Trinity, not businesses[0].
    await page.goto("/owner/finance", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(TRINITY_BUSINESS_NAME);
    let text = await bodyText(page);
    assertNoRawTokens(text, "Money");
    expect(text).not.toContain(FIXTURE_BUSINESS_A_NAME);
    expect(text).not.toContain(FIXTURE_BUSINESS_B_NAME);

    // 3. Customers — must already be on Trinity.
    await page.goto("/owner/customers", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(TRINITY_BUSINESS_NAME);
    text = await bodyText(page);
    assertNoRawTokens(text, "Customers");
    // Trinity has zero customer records seeded — the page must say so honestly, not silently
    // show another business's customers.
    expect(text).toMatch(/no customers yet/i);

    // 4. Operations — must already be on Trinity.
    await page.goto("/owner/operations", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(TRINITY_BUSINESS_NAME);
    text = await bodyText(page);
    assertNoRawTokens(text, "Operations");

    // 5. Home — must reflect Trinity's context and must not contradict Trinity's genuinely SAFE
    // finance diagnosis with a stale/other business's AT_RISK/INSOLVENT_RISK signal, and must not
    // assert a retention/churn claim Trinity has no customer evidence for.
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await expect
      .poll(async () => activeBusinessLabel(page), { timeout: 10000 })
      .toContain(TRINITY_BUSINESS_NAME);
    text = await bodyText(page);
    assertNoRawTokens(text, "Home");
    expect(text).not.toContain(FIXTURE_BUSINESS_A_NAME);
    expect(text).not.toContain(FIXTURE_BUSINESS_B_NAME);
    expect(text.toLowerCase()).not.toMatch(/customers (are )?not coming back|customers aren'?t (coming back|returning)|poor retention/);
    expect(text.toLowerCase()).not.toMatch(/cash survival is (at_risk|critical|insolvent_risk)/);

    // 6. Priorities and Tasks — zero acceptance-fixture pollution anywhere in the workspace-wide
    // views either.
    for (const route of ["/owner/priorities", "/owner/tasks"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      text = await bodyText(page);
      assertNoRawTokens(text, route);
      expect(text).not.toContain(FIXTURE_BUSINESS_A_NAME);
      expect(text).not.toContain(FIXTURE_BUSINESS_B_NAME);
      expect(text).not.toContain("OPSIQ Acceptance");
      expect(text).not.toContain("OPSIQ Production Acceptance");
    }

    // 7. Risk register — no raw internal risk codes as the primary owner-facing identifier.
    await page.goto("/owner/risks", { waitUntil: "networkidle" });
    text = await bodyText(page);
    assertNoRawTokens(text, "Risks");
    expect(text).not.toMatch(/\bstartup_[a-f0-9]{6,}_[a-z]+\b/);
  });
});
