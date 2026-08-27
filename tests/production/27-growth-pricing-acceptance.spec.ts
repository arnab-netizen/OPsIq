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
 *
 * OPSIQ-LIVE-ACCEPTANCE-CORRECTION Finding 2: workflow run 33043774531 proved
 * 27-02 was a stale-test defect, not a product defect. PR #362 correctly
 * added a REQUIRED "Features (one per line, at least one required)" textarea
 * to the create form (matching PricingEngine.createPriceTier's real
 * validatePriceTier invariant), but this spec's 27-02 never filled it --
 * native browser required-field validation silently stopped the form from
 * ever submitting, so no tier was ever created. 27-02 and 27-04 now fill a
 * real, uniquely acceptance-scoped feature value and prove it round-trips
 * through the real API, not just the UI. See growth-pricing-acceptance-
 * required-fields.test.ts for the static regression guard against this
 * recurring.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { authenticateProductionOwner } from "./helpers/production-auth";
import { startEvidenceCollection, captureOnFailure, checkpointScreenshot, finalizeEvidence } from "./helpers/evidence";
import { createJourneyWatch } from "./helpers/journey-watchers";

const SPEC_NAME = "phase27-growth-pricing";
const { networkFailures, watchPage, fatalErrors } = createJourneyWatch();

// Unique per run so repeated dispatches never collide on tier name/feature.
const TIER_NAME = `Acceptance Tier ${Date.now()}`;
const SUPERSEDED_TIER_NAME = `${TIER_NAME} v2`;
const TIER_FEATURE = `Acceptance feature ${Date.now()}`;
const SUPERSEDED_TIER_FEATURE = `${TIER_FEATURE} v2`;

interface AcceptanceTierRecord {
  id: string;
  name: string;
  features: string[];
  status: string;
  approvalStatus: string;
  supersededById: string | null;
}

/** Full persisted tier record by name, via the real API (never inferred from the UI alone). */
async function findTierByName(page: Page, name: string): Promise<AcceptanceTierRecord | null> {
  const res = await page.request.get("/api/growth/pricing-tiers/analysis");
  if (!res.ok()) return null;
  const tiers = (await res.json()).tiers as AcceptanceTierRecord[];
  return tiers.find((t) => t.name === name) ?? null;
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

  test("27-02 — create-tier form is reachable and creates a real price tier with a real submitted feature", async () => {
    await page.getByRole("button", { name: "+ New price tier" }).click();
    await page.locator('input[name="name"]').fill(TIER_NAME);
    await page.locator('input[name="entryPrice"]').fill("100");
    await page.locator('input[name="maxPrice"]').fill("500");
    // The Features textarea is a REQUIRED, no-default field (PricingEngine.
    // createPriceTier enforces "at least one feature" server-side via
    // validatePriceTier). Leaving it empty stops native browser required-
    // field validation from ever submitting the form -- see
    // growth-pricing-acceptance-required-fields.test.ts, which fails
    // statically if this fill is ever removed.
    await page.locator('textarea[name="features"]').fill(TIER_FEATURE);
    await page.getByRole("button", { name: "Create price tier (draft)" }).click();
    await page.waitForLoadState("networkidle");

    const created = await findTierByName(page, TIER_NAME);
    expect(created, "Created tier must be present via the API, not only the UI").toBeTruthy();
    createdTierId = created!.id;
    expect(created!.features, "Submitted feature must be persisted, not silently dropped").toContain(TIER_FEATURE);

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

  test("27-04 — supersede control is pre-populated with existing features, adds a real new one, and creates a new distinctly-versioned tier", async () => {
    test.skip(createdTierId === null, "No tier id captured from 27-02 -- cannot exercise supersede.");
    const originalTier = await findTierByName(page, TIER_NAME);
    expect(originalTier, "Original tier must still be resolvable via the API before superseding").toBeTruthy();

    const tierCard = page.getByTestId(`price-tier-${createdTierId}`);
    await tierCard.getByRole("button", { name: "Supersede (new version)" }).click();
    const supersedeForm = tierCard.locator("form");

    // The supersede form's Features textarea is required too, but pre-filled
    // from the existing tier's persisted features (page.tsx's defaultValue) --
    // prove that pre-population is real (not empty, not fabricated) before
    // adding to it.
    const featuresTextarea = supersedeForm.locator('textarea[name="features"]');
    const prefilled = await featuresTextarea.inputValue();
    expect(
      prefilled.split("\n").map((s) => s.trim()).filter(Boolean),
      "Supersede form must be pre-populated with the ORIGINAL tier's persisted features"
    ).toEqual(originalTier!.features);

    await supersedeForm.locator('input[name="name"]').fill(SUPERSEDED_TIER_NAME);
    await featuresTextarea.fill(`${prefilled}\n${SUPERSEDED_TIER_FEATURE}`);
    await supersedeForm.getByRole("button", { name: "Create new version" }).click();
    await page.waitForLoadState("networkidle");

    const superseded = await findTierByName(page, SUPERSEDED_TIER_NAME);
    expect(superseded, "Superseding tier must be present via the API, not only the UI").toBeTruthy();
    supersededTierId = superseded!.id;
    expect(superseded!.features, "New version must retain the original feature").toContain(TIER_FEATURE);
    expect(superseded!.features, "New version must carry the newly-added feature").toContain(SUPERSEDED_TIER_FEATURE);

    const oldTier = await findTierByName(page, TIER_NAME);
    expect(oldTier?.status, "Old tier must be archived once superseded").toBe("ARCHIVED");
    expect(oldTier?.supersededById, "Old tier's supersededById must point at the new version").toBe(supersededTierId);

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
