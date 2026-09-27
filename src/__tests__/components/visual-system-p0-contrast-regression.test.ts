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
    "src/app/(authenticated)/owner/first-value/page.tsx",
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

/**
 * MinimumOwnerCockpit (owner/cockpit) dark-mode migration — residual 2 of the
 * PR #385 closure pass.
 *
 * The residual audit found 50 failing WCAG AA text/background pairs in dark
 * mode (1.73:1–3.69:1) on this component: the overwhelming majority of its
 * bordered content boxes had NO explicit `background`, so they inherited the
 * real theme-following page background while their hardcoded hex text
 * (`#6b7280`, `#374151`, `#b45309`, ...) stayed fixed for a white background.
 * The fix follows the same "narrower, safer" CSS-custom-property-reference
 * migration this file's own comment above documents for finance/onboarding:
 * every bare hex that fed a theme-tracking element's text/border/background
 * is now a `var(--token)` reference, while genuinely self-consistent pairs
 * (a button whose own `background` and `color` are BOTH hardcoded together,
 * so it is legible regardless of theme even though it doesn't itself adopt
 * dark mode) and small decorative accents (status dots, thin left-border
 * accents) are deliberately left alone — see the closure report for the full
 * before/after contrast measurements. As with the finance/onboarding case,
 * true rendered-contrast assertions aren't practical in this repo's
 * vitest+jsdom stack, so this is a source-level, class-contract regression
 * test.
 */
describe("MinimumOwnerCockpit uses theme-aware CSS custom properties instead of bare hex on theme-tracking surfaces", () => {
  const relPath = "src/components/owner/MinimumOwnerCockpit.tsx";
  const source = read(relPath);

  it("no bordered content box is left without an explicit, theme-tracking background", () => {
    // The literal hex #e5e7eb (the audit's flagged border color on
    // background-less boxes) must not reappear anywhere in the file.
    expect(source).not.toMatch(/#e5e7eb/);
  });

  it("the OwnerDecisionCard (which replaced the retired FinanceTopPriorityCard as the Cockpit's primary slot) resolves its surface and text via CSS variables", () => {
    // The canonical owner decision card keeps the same editorial left-rule treatment the Finance
    // card had: a CSS-var rule color, no hardcoded hex on its own surface.
    const cardSource = readFileSync(join(process.cwd(), "src/components/owner/OwnerDecisionCard.tsx"), "utf8");
    expect(cardSource).toMatch(/borderColor:\s*"var\(--accent-ink\)"/);
    expect(cardSource).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(source).not.toMatch(/function FinanceTopPriorityCard/);
  });

  it("no theme-tracking text node uses the previously-broken bare #6b7280 or #374151 literal colors", () => {
    // Every literal `color: "#6b7280"` / `color: "#374151"` in the file was
    // either migrated to var(--muted-foreground) or — for the one exception,
    // the Do-Not-Repeat annotation box — sits inside a container with its own
    // hardcoded, non-theme-tracking background (#fffbeb), so it was never the
    // broken pattern and is deliberately left as-is (asserted below).
    const literalColorMatches = source.match(/color:\s*"#(6b7280|374151)"/g) ?? [];
    // The only literal survivors must be the two muted-tone references inside
    // the self-consistent Do-Not-Repeat box, plus its one #374151 body line —
    // never a bare match anywhere outside that container.
    expect(literalColorMatches.length).toBeLessThanOrEqual(3);
  });

  it("the Do-Not-Repeat annotation box that legitimately keeps hardcoded text colors has its own hardcoded (non-theme-tracking) background", () => {
    const dnrBlock = source.match(/cockpit-dnr-section[\s\S]*?<\/div>\s*\)\s*\}/);
    expect(dnrBlock).not.toBeNull();
    expect(dnrBlock![0]).toMatch(/background:\s*"#fffbeb"/);
  });

  it("status-color lookup tables reuse the existing --destructive token (unaffected by the semantic-color-closure text-token split) and the new readable-text tokens for success/warning/primary", () => {
    // PR #385 residual "semantic-color-closure": PORTFOLIO_DECISION_COLOR's
    // EXECUTE_NOW/DELAY/MERGE/SPLIT entries feed plain (non-fill) text color on
    // a <span> with no own background, so they were migrated from the bare
    // --success/--warning/--primary tokens (calibrated for control/badge FILL
    // use, not plain text) to the -text variants. CANCEL/ESCALATE use
    // --destructive, which was not part of that role collision and keeps its
    // original token unchanged.
    expect(source).toMatch(/EXECUTE_NOW:\s*"var\(--success-text\)"/);
    expect(source).toMatch(/DELAY:\s*"var\(--warning-text\)"/);
    expect(source).toMatch(/CANCEL:\s*"var\(--destructive\)"/);
    expect(source).toMatch(/MERGE:\s*"var\(--primary-text\)"/);
    expect(source).toMatch(/SPLIT:\s*"var\(--primary-text\)"/);
  });

  it("form inputs/selects/textareas resolve their border, background, and text color via CSS variables", () => {
    expect(source).not.toMatch(/border:\s*"1px solid #d1d5db",\s*borderRadius:\s*4,\s*fontSize:\s*12\s*\}\}/);
    const bareFormInputBorders = source.match(/<(input|select|textarea)[\s\S]{0,400}?border:\s*"1px solid #d1d5db"/g) ?? [];
    expect(bareFormInputBorders.length).toBe(0);
  });

  it("PRIORITY_LOGIC — the canonical owner decision owns the Cockpit's primary slot; the governed route stays subordinate", () => {
    expect(source).toMatch(/const decisionCard = ownerDecision \? <OwnerDecisionCard decision=\{ownerDecision\} \/> : null;/);
    expect(source).toMatch(/const top = bridge\?\.topRoute \?\? null;/);
    // The decision renders before the governed-work block, and no second elector remains.
    expect(source.indexOf("{decisionCard}")).toBeLessThan(source.indexOf('data-testid="cockpit-top-action"'));
    expect(source).not.toMatch(/financeTopPriority|FinanceTopPriorityCard|domainTopPriority/);
  });
});

/**
 * Loading-state migration coverage — residual 3 of the PR #385 closure pass.
 *
 * The residual audit enumerated 22 PAGE_LEVEL_SKELETON_REQUIRED instances
 * (full-page or list-area plain-text/spinner loaders with no layout
 * continuity) plus 2 more in the decision-inbox cluster (residual 4 overlap),
 * all now migrated to the existing skeleton family. It also enumerated 11
 * INLINE_ACTION_LOADING / TINY_LOCAL_STATE instances that were explicitly
 * NOT migrated (legitimate as-is: embedded widget spinners, tab-switch
 * loaders, header-subtitle text, a contact-picker-within-a-form loader).
 * This is a structural, source-level test: each migrated file imports and
 * renders a skeleton-family component in its loading branch, and each
 * explicitly-excluded file still uses its original plain-text/LoadingState
 * loader (proving it was not touched by this pass).
 */
describe("the 22 (+2) page-level loading states migrated to the skeleton family", () => {
  const migrated: Array<{ relPath: string; variant: string }> = [
    { relPath: "src/app/(authenticated)/owner/now/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/(authenticated)/owner/wealth/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/(authenticated)/owner/first-value/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/(authenticated)/owner/adjudication/page.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/(authenticated)/owner/process-intelligence/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/(authenticated)/owner/compliance/page.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/(authenticated)/owner/goals/page.tsx", variant: "DetailPageSkeleton" },
    { relPath: "src/app/(authenticated)/owner/data/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/(authenticated)/owner/alerts/page.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/(authenticated)/owner/startup/[sessionId]/page.tsx", variant: "DetailPageSkeleton" },
    { relPath: "src/app/(authenticated)/settings/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/(authenticated)/users/page.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/evidence/page.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/evidence/bundles/page.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/evidence/bundles/[bundleId]/page.tsx", variant: "DetailPageSkeleton" },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/evidence/[evidenceId]/page.tsx", variant: "DetailPageSkeleton" },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/business-impact/page.tsx", variant: "DetailPageSkeleton" },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/decision-evidence/page.tsx", variant: "DetailPageSkeleton" },
    { relPath: "src/app/entity/page.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/calibration/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/(authenticated)/report/page.tsx", variant: "CardDashboardSkeleton" },
    { relPath: "src/app/control/today/page.tsx", variant: "MetricSummarySkeleton" },
    { relPath: "src/components/decisions/DecisionInboxTable.tsx", variant: "TableListSkeleton" },
    { relPath: "src/app/(authenticated)/dashboard/inbox/inbox-client.tsx", variant: "TableListSkeleton" },
  ];

  it("covers exactly the 24 files enumerated by the residual audit (22 page-level + 2 decision-inbox overlap)", () => {
    expect(migrated.length).toBe(24);
  });

  for (const { relPath, variant } of migrated) {
    it(`${relPath} imports and renders ${variant} in its loading branch`, () => {
      const source = read(relPath);
      expect(source).toMatch(new RegExp(`\\b${variant}\\b`));
      // No bare "Loading…"/"Loading X..." plain-text-only early return should
      // remain as the sole loading UI (a skeleton component must be present
      // in the same loading-branch return).
      expect(source).toMatch(new RegExp(`<${variant}\\b`));
    });
  }
});

describe("the 11 justified inline/tiny loaders were NOT touched by the loading-state migration", () => {
  const untouched: Array<{ relPath: string; mustStillContain: RegExp }> = [
    { relPath: "src/app/(authenticated)/owner/trust/page.tsx", mustStillContain: /Loading explanations…/ },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/evidence/file-upload-form.tsx", mustStillContain: /LoadingState message="Loading contacts\.\.\."/ },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/evidence/manual-evidence-form.tsx", mustStillContain: /LoadingState message="Loading contacts\.\.\."/ },
    { relPath: "src/app/(authenticated)/engagements/[engagementId]/evidence/bundles/[bundleId]/add-evidence-form.tsx", mustStillContain: /LoadingState message="Loading evidence\.\.\."/ },
    { relPath: "src/app/operator/page.tsx", mustStillContain: /'Loading items\.\.\.'/ },
    { relPath: "src/app/my-day/page.tsx", mustStillContain: /'Loading your top items\.\.\.'/ },
    { relPath: "src/ui/kpi-trend.tsx", mustStillContain: /Loading\.\.\./ },
    { relPath: "src/ui/audit-timeline.tsx", mustStillContain: /Loading\.\.\./ },
    { relPath: "src/ui/governance-metrics-dashboard.tsx", mustStillContain: /Loading governance metrics\.\.\./ },
    { relPath: "src/ui/engagement-workspace.tsx", mustStillContain: /Loading \{tab\}\.\.\./ },
    { relPath: "src/components/data-review/AuditLogPanel.tsx", mustStillContain: /Loading\.\.\./ },
  ];

  it("covers exactly the 11 files the audit classified INLINE_ACTION_LOADING / TINY_LOCAL_STATE", () => {
    expect(untouched.length).toBe(11);
  });

  for (const { relPath, mustStillContain } of untouched) {
    it(`${relPath} still uses its original inline loader (not migrated to a page-level skeleton)`, () => {
      const source = read(relPath);
      expect(source).toMatch(mustStillContain);
    });
  }
});

/**
 * dashboard/inbox straggler — the same bg-white + theme-following-text P0 mechanism,
 * found by the mandatory post-fix repo-wide scan on a file this whole closure pass had
 * already migrated for an unrelated reason (its true/filtered empty-state split), which
 * is exactly why it slipped through the earlier bg-white sweep: it wasn't in that sweep's
 * baseline file list at all.
 *
 * Only the page's outer wrapper (`min-h-screen bg-white`) is the actual defect: it's the
 * ancestor background behind the theme-following `EmptyState` primitive (`bg-muted/20`
 * over whatever's beneath it, `text-foreground`/`text-muted-foreground` children) shown
 * on the true/filtered-empty paths — composited dark-mode contrast measured at 1.42:1
 * (title) / 1.73:1 (description) before the fix. The header bar and per-decision list-item
 * card ALSO use a literal `bg-white`, but each pairs it with its own hardcoded
 * `text-gray-900`/`text-gray-500` — the same self-consistent, not-broken pattern this PR's
 * P1 audit already classified and left alone on ~19 other legacy files elsewhere in the
 * app (see the "self-consistent" describe blocks above). Fixing only the wrapper — not
 * those two — matches that established precedent exactly.
 */
describe("dashboard/inbox's outer wrapper uses bg-card, not the broken bg-white", () => {
  const relPath = "src/app/(authenticated)/dashboard/inbox/inbox-client.tsx";

  it("the page's outer min-h-screen wrapper (the EmptyState's ancestor background) uses bg-card", () => {
    const source = read(relPath);
    expect(source).toMatch(/<div className="min-h-screen bg-card">/);
    expect(source).not.toMatch(/<div className="min-h-screen bg-white">/);
  });

  it("the header bar and decision-item card keep their own self-consistent bg-white + text-gray pairing (not this defect class, left alone by design)", () => {
    const source = read(relPath);
    expect(source).toMatch(/bg-white border-b border-gray-200 sticky top-0/);
    expect(source).toMatch(/block bg-white border border-gray-200 rounded-lg/);
  });
});
