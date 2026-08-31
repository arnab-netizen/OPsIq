/**
 * P0 contrast-defect regression guard (visual-system closure).
 *
 * Root cause, proven with a real rendered browser (see
 * docs/opsiq-governance visual-system-closure evidence): several card/section
 * surfaces were styled with the hardcoded Tailwind utility `bg-white`
 * (literal #fff, never re-evaluated per theme) while their text relied on the
 * theme-following `--foreground` token (inherited body color, or the
 * `text-foreground` class) — which turns near-white in dark mode. The pairing
 * produced near-invisible white-on-white text specifically on
 * /owner/finance's diagnosis score/finding headlines and /owner/onboarding's
 * completed-step labels whenever the OS/browser reports
 * `prefers-color-scheme: dark`.
 *
 * True CSS-computed-contrast assertions aren't practical in this repo's
 * vitest+jsdom stack (jsdom does not implement real layout or `getComputedStyle`
 * color resolution against CSS custom properties / media queries), so this is
 * a source-level, class-contract regression test: it asserts the specific
 * previously-broken files use the theme-aware `bg-card` surface instead of the
 * literal `bg-white` utility, and that the `--card`/`--card-foreground` tokens
 * those classes resolve to are actually defined for both the light and dark
 * blocks in globals.css. The real-browser, computed-contrast-ratio proof (light
 * 17.85:1 / dark 13.98:1 for finance; light 4.76:1 / dark 5.71:1 for
 * onboarding's now-muted completed labels) lives in the audit evidence, not
 * here — this test exists only to keep the regression from silently
 * reappearing in source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("globals.css defines the --card/--card-foreground surface tokens", () => {
  const css = read("src/app/globals.css");

  it("defines --card and --card-foreground on :root (light mode)", () => {
    expect(css).toMatch(/--card:\s*#ffffff/);
    expect(css).toMatch(/--card-foreground:\s*var\(--foreground\)/);
  });

  it("maps --color-card / --color-card-foreground into the Tailwind @theme so bg-card/text-card-foreground exist as utilities", () => {
    expect(css).toMatch(/--color-card:\s*var\(--card\)/);
    expect(css).toMatch(/--color-card-foreground:\s*var\(--card-foreground\)/);
  });

  it("redefines --card for prefers-color-scheme: dark, distinct from the light value", () => {
    const darkBlockMatch = css.match(/@media \(prefers-color-scheme: dark\)[\s\S]*?\n\}\n/);
    expect(darkBlockMatch).not.toBeNull();
    const darkBlock = darkBlockMatch![0];
    expect(darkBlock).toMatch(/--card:\s*#1e293b/);
    // Must NOT stay pinned to the light-mode white — that recreates the defect.
    expect(darkBlock).not.toMatch(/--card:\s*#ffffff/);
  });
});

describe("previously-broken card surfaces use the theme-aware bg-card class, not hardcoded bg-white", () => {
  const targets = [
    "src/app/(authenticated)/owner/finance/page.tsx",
    "src/app/(authenticated)/owner/onboarding/page.tsx",
  ];

  for (const relPath of targets) {
    it(`${relPath} contains no literal "bg-white" card surface`, () => {
      const source = read(relPath);
      expect(source).not.toMatch(/\bbg-white\b/);
    });

    it(`${relPath} uses the theme-aware "bg-card" surface for its card sections`, () => {
      const source = read(relPath);
      expect(source).toMatch(/\bbg-card\b/);
    });
  }

  it("onboarding's completed-step label is de-emphasized (muted) relative to the active step, not full-strength foreground", () => {
    const source = read("src/app/(authenticated)/owner/onboarding/page.tsx");
    // The specific line the audit flagged: completed steps must resolve to the
    // AA-passing muted-foreground token, and the still-active step keeps full
    // foreground strength — regressing this back to `s.complete ? "text-foreground"`
    // both re-inverts the intended visual hierarchy and (given a bg-card that
    // is white in light mode / dark in dark mode) stays contrast-safe either
    // way, so this assertion targets the hierarchy contract specifically.
    expect(source).toMatch(/s\.complete\s*\?\s*"text-muted-foreground"\s*:\s*"text-foreground/);
  });
});

describe("no other file in the audited owner/consulting surface reintroduces the bg-white + token-text pairing", () => {
  // The full repo-wide sweep (25 files) is enumerated in the visual-system
  // closure report. This is a spot-check on a representative sample beyond
  // the two originally-flagged pages, so a future accidental revert of any one
  // of them is still caught even if this list isn't exhaustive.
  const sample = [
    "src/app/(authenticated)/owner/cashflow/page.tsx",
    "src/app/(authenticated)/owner/marketing/page.tsx",
    "src/app/(authenticated)/owner/operations/page.tsx",
    "src/app/(authenticated)/owner/strategy/page.tsx",
    "src/app/(authenticated)/owner/sales/page.tsx",
    "src/app/(authenticated)/owner/execution/page.tsx",
    "src/app/(authenticated)/owner/page.tsx",
    "src/app/(authenticated)/diagnosis/page.tsx",
    "src/app/(authenticated)/opsiq/consulting-engine/page.tsx",
    "src/ui/owner-dashboard.tsx",
  ];

  for (const relPath of sample) {
    it(`${relPath} contains no literal "bg-white" card surface`, () => {
      const source = read(relPath);
      expect(source).not.toMatch(/\bbg-white\b/);
    });
  }
});
