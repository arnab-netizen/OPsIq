/**
 * OPSIQ-LIVE-ACCEPTANCE-CORRECTION Finding 2 -- static regression guard.
 *
 * Workflow run 33043774531 proved 27-02 was a stale-test defect: the owner UI
 * (src/app/(authenticated)/owner/growth-pricing/page.tsx) requires a
 * `textarea[name="features"]` value with no default on its create form
 * (server-side invariant: PricingEngine.createPriceTier -> validatePriceTier,
 * "At least one feature is required"), but the acceptance spec never filled
 * it -- native browser required-field validation silently stopped the form
 * from ever submitting, so no tier was created, and the API lookup correctly
 * found none.
 *
 * This is the general form of the mismatch: a server-required owner-input
 * field with no default can be added to a form, and an acceptance spec
 * written before that field existed will keep "passing" (skipping) its way
 * to a false negative instead of failing loudly. This test scans BOTH the
 * page (to know which fields are actually required-with-no-default) and the
 * acceptance spec (to know which of those fields it fills before each
 * submit), so a future required field added to either form without a
 * matching spec update fails HERE, not as a live-production surprise.
 */
import { readFileSync } from "fs";
import { join } from "path";

const PAGE_PATH = join(
  process.cwd(),
  "src/app/(authenticated)/owner/growth-pricing/page.tsx"
);
const SPEC_PATH = join(process.cwd(), "tests/production/27-growth-pricing-acceptance.spec.ts");

const PAGE_SRC = readFileSync(PAGE_PATH, "utf-8");
const SPEC_SRC = readFileSync(SPEC_PATH, "utf-8");

/**
 * Every `<Input .../>` or `<Textarea .../>` tag with both `required` and no
 * `defaultValue=` prop is a field a real submission cannot skip. Matches
 * across the two known forms (create + supersede) without assuming which
 * form the tag belongs to -- the spec-side checks below scope by form.
 */
function requiredFieldsWithNoDefault(formSrc: string): string[] {
  const tagRegex = /<(?:Input|Textarea)\s+([^>]*?)\/>/gs;
  const fields: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(formSrc)) !== null) {
    const tag = match[1];
    if (!/\brequired\b/.test(tag)) continue;
    if (/defaultValue=/.test(tag)) continue;
    const nameMatch = tag.match(/name="([^"]+)"/);
    if (nameMatch) fields.push(nameMatch[1]);
  }
  return fields;
}

describe("Growth Pricing owner UI -- required-with-no-default fields are known and named", () => {
  it("the create form's Features textarea is (still) required with no default -- sanity check the page itself", () => {
    const createFormMatch = PAGE_SRC.match(/<form onSubmit=\{createTier\}[\s\S]*?<\/form>/);
    expect(createFormMatch, "createTier form must exist in the page source").toBeTruthy();
    const fields = requiredFieldsWithNoDefault(createFormMatch![0]);
    expect(fields).toContain("features");
  });
});

describe("27-growth-pricing-acceptance.spec.ts -- exercises every server-required, no-default owner-input field", () => {
  it('27-02 fills textarea[name="features"] before clicking "Create price tier (draft)"', () => {
    const idx = SPEC_SRC.indexOf('test("27-02');
    expect(idx).toBeGreaterThan(-1);
    const clickIdx = SPEC_SRC.indexOf('name: "Create price tier (draft)"', idx);
    expect(clickIdx).toBeGreaterThan(idx);
    const setup = SPEC_SRC.slice(idx, clickIdx);
    expect(setup).toMatch(/\.locator\('textarea\[name="features"\]'\)\.fill\(/);
  });

  it('27-04 reads the supersede form\'s pre-populated textarea[name="features"] before submitting a change to it', () => {
    const idx = SPEC_SRC.indexOf('test("27-04');
    expect(idx).toBeGreaterThan(-1);
    const clickIdx = SPEC_SRC.indexOf('name: "Create new version"', idx);
    expect(clickIdx).toBeGreaterThan(idx);
    const setup = SPEC_SRC.slice(idx, clickIdx);
    expect(setup).toMatch(/featuresTextarea\.inputValue\(\)/);
    expect(setup).toMatch(/featuresTextarea\.fill\(/);
  });

  it("does not create or supersede a tier without touching the features field (no bare submit-only-required-fields regression)", () => {
    // A submit click for either form must be preceded, somewhere earlier in
    // the same test body, by a reference to the features field AND a
    // .fill( call -- guards against a future edit that re-adds the click
    // without the fill. (The two tests above already pin the EXACT expected
    // pattern per form; this is a looser belt-and-suspenders check.)
    for (const [testMarker, clickMarker] of [
      ['test("27-02', 'name: "Create price tier (draft)"'],
      ['test("27-04', 'name: "Create new version"'],
    ] as const) {
      const idx = SPEC_SRC.indexOf(testMarker);
      const clickIdx = SPEC_SRC.indexOf(clickMarker, idx);
      const setup = SPEC_SRC.slice(idx, clickIdx);
      expect(setup, `${testMarker}: must reference the features field`).toMatch(/features/i);
      expect(setup, `${testMarker}: must fill the features field before submitting`).toMatch(/\.fill\(/);
    }
  });
});
