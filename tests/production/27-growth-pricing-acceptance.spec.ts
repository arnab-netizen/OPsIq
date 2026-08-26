/**
 * LIVE PRODUCTION acceptance -- Growth Pricing owner UI.
 *
 * Growth Pricing is workspace-scoped (PricingEngine keys every tier by
 * ctx.verifiedWorkspaceId), not per-business like Sales/Marketing/etc. --
 * there is no business selector on this page and no dedicated acceptance
 * business is created here, unlike the domain-acceptance specs. This spec
 * therefore mutates workspace-level price-tier data directly (create,
 * approve, supersede) rather than routing through helpers/domain-business.ts.
 *
 * Every card is located via its data-testid=`price-tier-${id}` (added
 * alongside this spec) rather than by text content -- a plain hasText div
 * locator would also match every ancestor wrapper div containing the same
 * text (the page's own outer container included), not just the card.
 *
 * Closes the production-proof gap for PR #359 (owner/growth-pricing page):
 * verifies the deployed page loads, the analysis/margin summary renders,
 * the create-tier form is reachable and functional, and the approve/
 * supersede controls render and work for real existing data -- the exact
 * evidence requested before marking that closure PRODUCTION_PROVEN.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { authenticateProductionOwner } from "./helpers/production-auth";
import { startEvidenceCollection, captureOnFailure, checkpointScreenshot, finalizeEvidence } from "./helpers/evidence";
import { createJourneyWatch } from "./helpers/journey-watchers";

const SPEC_NAME = "phase27-growth-pricing";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

// Unique per run so repeated dispatches never collide on tier name.
const TIER_NAME = `Acceptance Tier ${Date.now()}`;
const SUPERSEDED_TIER_NAME = `${TIER_NAME} v2`;

async function findTierIdByName(page: Page, name: string): Promise<string | null> {
  const res = await page.request.get("/api/growth/pricing-tiers/analysis");
  if (!res.ok()) return null;
  const tiers = (await res.json()).tiers as Array<{ id: string; name: string }>;
  return tiers.find((t) => t.name === name)?.id ?? null;
}

test.describe("PROD-27 — Growth Pricing owner UI live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let createdTierId: string | null = null;
  let supersededTierId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchPage(page);
    await authenticateProductionOwner(page);
    await startEvidenceCollection(context, page, SPEC_NAME);
  });

  test.afterEach(async ({}, testInfo) => {
    await captureOnFailure(context, page, testInfo, SPEC_NAME);
  });

  test.afterAll(async () => {
    await finalizeEvidence(context, SPEC_NAME);
    if (context) await context.close();
  });

  test.describe.configure({ mode: "serial" });

  test("27-01 — page loads with no workspace/auth error, analysis summary renders", async () => {
    await page.goto("/owner/growth-pricing", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Growth Pricing" })).toBeVisible();
    // Confirms the analysis endpoint actually returned and rendered (not
    // stuck on the loading state, not a workspace/auth error banner).
    await expect(page.getByText("Loading growth pricing workspace…")).toHaveCount(0);
    await expect(page.getByText(/Failed to load|workspace|unauthorized/i)).toHaveCount(0);
    await expect(page.getByText("Tiers", { exact: true })).toBeVisible();
    await checkpointScreenshot(context, page, SPEC_NAME, "page-loaded");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("27-02 — create-tier form is reachable and creates a real price tier", async () => {
    await page.getByRole("button", { name: "+ New price tier" }).click();
    await page.locator('input[name="name"]').fill(TIER_NAME);
    await page.locator('input[name="entryPrice"]').fill("100");
    await page.locator('input[name="maxPrice"]').fill("500");
    await page.getByRole("button", { name: "Create price tier (draft)" }).click();
    await page.waitForLoadState("networkidle");

    createdTierId = await findTierIdByName(page, TIER_NAME);
    expect(createdTierId, "Created tier must be present via the API, not only the UI").toBeTruthy();

    const tierCard = page.getByTestId(`price-tier-${createdTierId}`);
    await expect(tierCard).toBeVisible();
    await expect(tierCard).toContainText("pending_approval");
    await checkpointScreenshot(context, page, SPEC_NAME, "tier-created");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("27-03 — approve control renders for real existing data and approving it updates status", async () => {
    test.skip(createdTierId === null, "No tier id captured from 27-02 -- cannot exercise approve.");
    const tierCard = page.getByTestId(`price-tier-${createdTierId}`);
    await tierCard.getByRole("button", { name: "Approve" }).click();
    await page.waitForLoadState("networkidle");
    await expect(tierCard).toContainText("approved");
    await checkpointScreenshot(context, page, SPEC_NAME, "tier-approved");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("27-04 — supersede control renders and creates a new, distinctly-versioned tier", async () => {
    test.skip(createdTierId === null, "No tier id captured from 27-02 -- cannot exercise supersede.");
    const tierCard = page.getByTestId(`price-tier-${createdTierId}`);
    await tierCard.getByRole("button", { name: "Supersede (new version)" }).click();
    const supersedeForm = tierCard.locator("form");
    await supersedeForm.locator('input[name="name"]').fill(SUPERSEDED_TIER_NAME);
    await supersedeForm.getByRole("button", { name: "Create new version" }).click();
    await page.waitForLoadState("networkidle");

    supersededTierId = await findTierIdByName(page, SUPERSEDED_TIER_NAME);
    expect(supersededTierId, "Superseding tier must be present via the API, not only the UI").toBeTruthy();

    const newTierCard = page.getByTestId(`price-tier-${supersededTierId}`);
    await expect(newTierCard).toBeVisible();
    await expect(tierCard).toContainText("Superseded by a newer version");
    await checkpointScreenshot(context, page, SPEC_NAME, "tier-superseded");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("27-05 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
  });

  test("27-06 — record findings for the acceptance report", () => {
    writeFileSync(
      `production-test-results/evidence/${SPEC_NAME}-summary.json`,
      JSON.stringify(
        {
          createdTierId,
          supersededTierId,
          fatalConsoleErrors: fatalErrors(),
          serverErrors: networkFailures,
        },
        null,
        2
      )
    );
  });
});
