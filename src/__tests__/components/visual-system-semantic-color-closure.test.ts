/**
 * Semantic-color-closure regression guard (PR #385 residual, follow-up to the
 * P0 contrast-defect closure in visual-system-p0-contrast-regression.test.ts).
 *
 * Root cause: `--primary`/`--warning`/`--success` in globals.css each serve
 * TWO jobs — (a) a control/accent/badge FILL color (a button's own
 * background, or a Badge's own `bg-token/10` tinted pill — both self-
 * consistent, unaffected here) and (b) plain, small, readable body/link/
 * status TEXT sitting directly on `--background`/`--card`. The tokens were
 * only ever calibrated for job (a): `--primary`'s dark value is 3.98:1 on
 * `--card` (fails AA's 4.5:1 for normal text); `--warning`/`--success`'s
 * LIGHT values are 3.19:1/3.30:1 on white (also fails). This is a genuine
 * token-role collision, not a cockpit-specific bug — confirmed live (real
 * Chromium + getComputedStyle) on `/owner/cockpit`'s 6 reported elements and
 * repo-wide across ~48 other files using the same bare-token-as-text pattern.
 *
 * The fix adds three NEW tokens — `--primary-text`/`--warning-text`/
 * `--success-text` — a third role distinct from both the base fill token and
 * the existing `-foreground` tokens (text-on-fill, e.g. white text on a solid
 * `--primary` button). `--primary`/`--warning`/`--success`/`--destructive`
 * and their `-foreground` pairs are NOT redefined — every button, badge,
 * border, icon, and focus ring keeps using exactly what it used before.
 *
 * Unlike the P0 test above (jsdom limitation, source-level only), THIS file
 * computes real WCAG contrast ratios from the token hex values extracted out
 * of globals.css using the same relative-luminance formula the live-browser
 * audit used — a deterministic, real numeric compliance check, not just
 * "the token is defined". See
 * /tmp/.../scratchpad/pr385-semantic-color-closure.md for the full live
 * (Playwright + real Chromium) before/after evidence this was built from.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

// ---- WCAG 2.x contrast math (same formula used by the live-browser audit) ----
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map(srgbToLinear);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---- extract token values straight out of globals.css (no hardcoded duplication) ----
const css = read("src/app/globals.css");

function extractRootBlock(source: string): string {
  // The first top-level `:root { ... }` block (light mode).
  const m = source.match(/^:root\s*\{([\s\S]*?)\n\}/m);
  if (!m) throw new Error("Could not locate light :root block in globals.css");
  return m[1];
}
function extractDarkBlock(source: string): string {
  const m = source.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n {2}\}\n\}/);
  if (!m) throw new Error("Could not locate dark :root block in globals.css");
  return m[1];
}
function tokenValue(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`Token --${name} not found in block`);
  return m[1];
}

const lightBlock = extractRootBlock(css);
const darkBlock = extractDarkBlock(css);

const tokens = {
  light: {
    background: tokenValue(lightBlock, "background"),
    card: tokenValue(lightBlock, "card"),
    primary: tokenValue(lightBlock, "primary"),
    warning: tokenValue(lightBlock, "warning"),
    success: tokenValue(lightBlock, "success"),
    primaryText: tokenValue(lightBlock, "primary-text"),
    warningText: tokenValue(lightBlock, "warning-text"),
    successText: tokenValue(lightBlock, "success-text"),
  },
  dark: {
    background: tokenValue(darkBlock, "background"),
    card: tokenValue(darkBlock, "card"),
    primary: tokenValue(darkBlock, "primary"),
    warning: tokenValue(darkBlock, "warning"),
    success: tokenValue(darkBlock, "success"),
    primaryText: tokenValue(darkBlock, "primary-text"),
    warningText: tokenValue(darkBlock, "warning-text"),
    successText: tokenValue(darkBlock, "success-text"),
  },
};

const AA_NORMAL = 4.5;

describe("globals.css: the new readable-text tokens are defined for both themes", () => {
  it("--primary-text/--warning-text/--success-text are defined on :root (light) and redefined in the dark media block", () => {
    for (const name of ["primaryText", "warningText", "successText"] as const) {
      expect(tokens.light[name]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokens.dark[name]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("is NOT registered in the @theme inline block (verified Turbopack/Tailwind v4 quirk: a @theme-inline-mapped custom property silently loses its @media dark override in the compiled CSS)", () => {
    expect(css).not.toMatch(/--color-primary-text:/);
    expect(css).not.toMatch(/--color-warning-text:/);
    expect(css).not.toMatch(/--color-success-text:/);
  });
});

describe("the new readable-text tokens pass WCAG AA (4.5:1) for normal text against BOTH --background and --card, in BOTH themes", () => {
  const cases: Array<{ theme: "light" | "dark"; tokenName: "primaryText" | "warningText" | "successText" }> = [
    { theme: "light", tokenName: "primaryText" },
    { theme: "light", tokenName: "warningText" },
    { theme: "light", tokenName: "successText" },
    { theme: "dark", tokenName: "primaryText" },
    { theme: "dark", tokenName: "warningText" },
    { theme: "dark", tokenName: "successText" },
  ];

  for (const { theme, tokenName } of cases) {
    const t = tokens[theme];
    const value = t[tokenName];

    it(`${theme} --${tokenName.replace("Text", "-text")} (${value}) vs --background (${t.background}) >= ${AA_NORMAL}:1`, () => {
      const ratio = contrastRatio(value, t.background);
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it(`${theme} --${tokenName.replace("Text", "-text")} (${value}) vs --card (${t.card}) >= ${AA_NORMAL}:1`, () => {
      const ratio = contrastRatio(value, t.card);
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }
});

describe("the base --primary/--warning/--success tokens are NOT redefined by this change (additive tokens only)", () => {
  it("light values are unchanged from the pre-existing tokens (button/badge/border/icon fills keep their exact color)", () => {
    expect(tokens.light.primary).toBe("#1e40af");
    expect(tokens.light.warning).toBe("#d97706");
    expect(tokens.light.success).toBe("#16a34a");
  });

  it("dark values are unchanged from the pre-existing tokens (button/badge/border/icon fills keep their exact color)", () => {
    expect(tokens.dark.primary).toBe("#3b82f6");
    expect(tokens.dark.warning).toBe("#f59e0b");
    expect(tokens.dark.success).toBe("#22c55e");
  });

  it("--primary-foreground/--warning's/--success's -foreground counterparts are untouched (no such tokens were added or changed — button text-on-fill still comes from --primary-foreground)", () => {
    expect(css).toMatch(/--primary-foreground:\s*#ffffff/);
  });
});

describe("MinimumOwnerCockpit + owner/cockpit/page: the 6 originally-reported elements (and their same-root-cause siblings) use the new -text tokens, not the bare fill token, for plain text color", () => {
  const cockpitSource = read("src/components/owner/MinimumOwnerCockpit.tsx");

  it("the OwnerDecisionCard's main call to action is the page's primary (filled) control, and its text links use --primary-text", () => {
    const cardSource = read("src/components/owner/OwnerDecisionCard.tsx");
    // The main target owns the strongest control on every surface (hostile review F: a secondary
    // governed-work button must not out-shout it). Theme tokens only — no literal colours.
    expect(cardSource).toMatch(/data-testid="owner-decision-go"[^>]*bg-primary[^>]*text-primary-foreground/);
    expect(cardSource).toMatch(/text-\[var\(--primary-text\)\] underline/);
    expect(cardSource).not.toMatch(/var\(--(primary|warning|success)\)"/);
  });

  it("ExecutionLifecycleSection's 'In execution' summary heading uses --primary-text", () => {
    expect(cockpitSource).toMatch(/color: "var\(--primary-text\)" \}\}>\s*\n\s*In execution/);
  });

  it("'Requires your decision' and 'Awaiting verification' summary headings use --warning-text", () => {
    expect(cockpitSource).toMatch(/color: "var\(--warning-text\)" \}\}>\s*\n\s*Requires your decision/);
    expect(cockpitSource).toMatch(/color: "var\(--warning-text\)" \}\}>\s*\n\s*Awaiting verification/);
  });

  it("'Recently verified' summary heading uses --success-text", () => {
    expect(cockpitSource).toMatch(/color: "var\(--success-text\)" \}\}>\s*\n\s*Recently verified/);
  });

  it("the Blocked/not-allowed avoid-list items and blocked-unsafe/recovery-blocked/condition-stale status text use --warning-text", () => {
    expect(cockpitSource).toMatch(/data-testid="cockpit-avoid" style=\{\{ fontSize: 13, color: "var\(--warning-text\)"/);
    expect(cockpitSource).toMatch(/data-testid="cockpit-blocked-unsafe" style=\{\{[^}]*color: "var\(--warning-text\)"/);
    expect(cockpitSource).toMatch(/color: "var\(--warning-text\)" \}\} data-testid="cockpit-recovery-blocked"/);
    expect(cockpitSource).toMatch(/color: "var\(--warning-text\)", fontStyle: "italic" \}\} data-testid="cockpit-condition-stale"/);
  });

  it("the PORTFOLIO_DECISION_COLOR lookup table's success/warning/primary entries use the -text variants (CANCEL/ESCALATE keep --destructive, untouched)", () => {
    expect(cockpitSource).toMatch(/EXECUTE_NOW: "var\(--success-text\)", DELAY: "var\(--warning-text\)", CANCEL: "var\(--destructive\)"/);
    expect(cockpitSource).toMatch(/MERGE: "var\(--primary-text\)", SPLIT: "var\(--primary-text\)", ESCALATE: "var\(--destructive\)"/);
  });

  it("the 'terminal' status line and the two 'no trend alerts'/'no open escalations' success messages use --success-text", () => {
    expect(cockpitSource).toMatch(/data-testid="cockpit-terminal" style=\{\{[^}]*color: "var\(--success-text\)"/);
    expect(cockpitSource).toMatch(/color: "var\(--success-text\)" \}\}>No trend alerts/);
    expect(cockpitSource).toMatch(/color: "var\(--success-text\)" \}\}>No open escalations/);
  });

  it("the Do-Not-Repeat box's OWN hardcoded background/text (bucket 3, self-consistent, never broken) is left untouched — not migrated to the new tokens", () => {
    const dnrBlock = cockpitSource.match(/cockpit-dnr-section[\s\S]*?<\/div>\s*\)\s*\}/);
    expect(dnrBlock).not.toBeNull();
    expect(dnrBlock![0]).toMatch(/background:\s*"#fffbeb"/);
    expect(dnrBlock![0]).not.toMatch(/var\(--(primary|warning|success)-text\)/);
  });

  it("the one legitimately-preserved control usage — the 'Record owner override' ghost button's BORDER — still uses the base --warning token (borders are non-text UI-boundary elements, 3:1 requirement, already satisfied by the base token; only the button's TEXT color was migrated)", () => {
    expect(cockpitSource).toMatch(/border:\s*"1px solid var\(--warning\)",\s*color:\s*"var\(--warning-text\)"/);
  });

  it("no plain-text color in the file still reads the bare --primary/--warning/--success token directly (every prior instance was either migrated or is the one documented border exception)", () => {
    const bareTokenColorUses = cockpitSource.match(/color:\s*"var\(--(primary|warning|success)\)"/g) ?? [];
    expect(bareTokenColorUses.length).toBe(0);
  });

  it("owner/cockpit/page.tsx has no plain-text bare-token usage either (it had none before this pass — only var(--destructive) in its error state, unaffected)", () => {
    const pageSource = read("src/app/(authenticated)/owner/cockpit/page.tsx");
    const bareTokenColorUses = pageSource.match(/var\(--(primary|warning|success)\)/g) ?? [];
    expect(bareTokenColorUses.length).toBe(0);
  });
});

describe("PRIORITY_LOGIC / precedence contract is unchanged by the semantic-color-closure pass (presentation-only diff)", () => {
  const cockpitSource = read("src/components/owner/MinimumOwnerCockpit.tsx");
  it("canonical decision / topRoute precedence wiring: the decision card owns the primary slot", () => {
    expect(cockpitSource).toMatch(/const decisionCard = ownerDecision \? <OwnerDecisionCard decision=\{ownerDecision\} \/> : null;/);
    expect(cockpitSource).toMatch(/const top = bridge\?\.topRoute \?\? null;/);
    expect(cockpitSource).not.toMatch(/FinanceTopPriorityCard/);
  });
});

describe("app-wide migration: the shared Badge/Button primitives and every bg-token/NN tinted-fill (badge-style) usage are untouched (control/accent/badge fills keep the base token)", () => {
  it("src/ui/primitives/badge.tsx still uses the base --primary/--warning/--success/--destructive tokens (bg-token/10 text-token pairs, self-consistent, out of scope)", () => {
    const badgeSource = read("src/ui/primitives/badge.tsx");
    expect(badgeSource).toMatch(/bg-primary\/10 text-primary border-primary\/20/);
    expect(badgeSource).toMatch(/bg-success\/10 text-success border-success\/20/);
    expect(badgeSource).toMatch(/bg-warning\/10 text-warning border-warning\/20/);
    // The original "destructive"/"muted" variant entries are untouched (still the bare-token
    // pattern, no -text token). This does NOT extend to "destructive-accessible"/"muted-accessible"
    // — two new, additive, opt-in variants added later (see the --destructive-text/
    // --muted-foreground-accessible describe block below) for owner-facing severity/confidence
    // badges that axe found failing 4.5:1; every other Badge consumer, "destructive"/"muted"
    // included, keeps using exactly what it used before.
    expect(badgeSource).toMatch(/^\s*destructive:\s*"bg-destructive\/10 text-destructive border-destructive\/20",$/m);
    expect(badgeSource).toMatch(/^\s*muted:\s*"bg-muted text-muted-foreground border-border",$/m);
  });

  it("the account-menu avatar-initial badge (bg-primary/10 tinted circle) keeps the base --primary token — it is the same self-consistent tinted-fill pattern as Badge, not the broken plain-text pattern", () => {
    // PR #435's app-shell redesign moved this badge out of app-header.tsx and into its own
    // AccountMenu component (the header's previous non-interactive avatar became a real,
    // clickable account menu) -- same markup, same token usage, new home. See
    // AccountMenu.tsx's own header comment.
    const accountMenuSource = read("src/components/owner/AccountMenu.tsx");
    expect(accountMenuSource).toMatch(/bg-primary\/10 flex items-center justify-center/);
    expect(accountMenuSource).toMatch(/<span className="text-xs font-medium text-primary">/);
  });

  it("the app-header brand mark is the real OpsIQ logo image, not styled text -- no --primary-text token applies to it anymore", () => {
    // Brand-PR follow-up: the wordmark used to be plain text colored via the arbitrary-value
    // form of --primary-text (this test's original assertion). It is now the real OpsIQ logo
    // PNG (public/opsiq-logo.png / public/opsiq-mark.png), whose navy/blue are baked into the
    // asset's own pixels, not read from any CSS custom property -- so this token-migration
    // concern no longer applies to this element at all.
    const headerSource = read("src/ui/shell/app-header.tsx");
    expect(headerSource).toMatch(/opsiq-logo\.png/);
    expect(headerSource).toMatch(/opsiq-mark\.png/);
  });

  it("large-text (>=24px, or >=18.66px+font-bold) instances that already pass AA at the large-text 3:1 threshold under the base token were deliberately left unmigrated (no blanket recolor)", () => {
    // login/signup/forgot-password/reset-password 2xl bold "OpsIQ" headers, and
    // LandingPage/error.tsx's xl bold "OpsIQ" — all >=20px + font-bold (>=18.66px
    // bold qualifies as WCAG large text, dropping the required ratio to 3:1,
    // which --primary's dark value (3.98:1) already clears).
    const untouchedLargeTextFiles = [
      "src/app/login/page.tsx",
      "src/app/signup/page.tsx",
      "src/app/forgot-password/page.tsx",
      "src/app/reset-password/page.tsx",
      "src/app/error.tsx",
      "src/components/landing/LandingPage.tsx",
    ];
    for (const relPath of untouchedLargeTextFiles) {
      const source = read(relPath);
      // Each of these files' large-bold "OpsIQ" wordmark still reads the base
      // token directly (some of the SAME files also have small-text links that
      // WERE migrated — this only asserts the base token still appears at all).
      expect(source).toMatch(/text-primary\b/);
    }
  });

  it("a representative sample of migrated small/plain-text link and status instances use the arbitrary-value form (deterministic — the class computes to `color: var(--x-text)`, identical to the cockpit's inline-style usage)", () => {
    const sample: Array<{ relPath: string; pattern: RegExp }> = [
      { relPath: "src/app/(authenticated)/dashboard/page.tsx", pattern: /text-\[var\(--primary-text\)\]/ },
      { relPath: "src/app/(authenticated)/dashboard/page.tsx", pattern: /text-\[var\(--warning-text\)\]/ },
      { relPath: "src/app/(authenticated)/owner/page.tsx", pattern: /text-\[var\(--success-text\)\]/ },
      { relPath: "src/components/decision/TrustCard.tsx", pattern: /text-\[var\(--success-text\)\]/ },
      { relPath: "src/components/decision/TrustCard.tsx", pattern: /text-\[var\(--warning-text\)\]/ },
      { relPath: "src/ui/findings-manager.tsx", pattern: /text-\[var\(--warning-text\)\]/ },
    ];
    for (const { relPath, pattern } of sample) {
      const source = read(relPath);
      expect(source).toMatch(pattern);
    }
  });

  it("decision/DecisionResult.tsx's large-text (text-2xl font-bold) decision-color function was deliberately left on the base --success/--destructive tokens (already AA-compliant at the large-text threshold)", () => {
    const source = read("src/components/decision/DecisionResult.tsx");
    expect(source).toMatch(/getDecisionColor[\s\S]{0,120}'text-success'/);
  });

  it("owner/data/page.tsx's 3xl-bold blocked-actions count (dashboard/page.tsx) was left on the base --warning token (already AA-compliant at the large-text threshold, both themes)", () => {
    const source = read("src/app/(authenticated)/dashboard/page.tsx");
    expect(source).toMatch(/text-3xl font-bold text-warning\b/);
    expect(source).not.toMatch(/text-3xl font-bold text-\[var\(--warning-text\)\]/);
  });
});

/**
 * --destructive-text / --muted-foreground-accessible (follow-up to the two closures above):
 * real owner-facing severity/confidence badges on Home, Onboarding, and My Business measured
 * 4.13-4.40:1 with axe (@axe-core/playwright) -- --destructive and --muted-foreground on their
 * own badge fills, just under AA. Same fix shape as --primary-text/--warning-text/--success-text:
 * new, additive, opt-in tokens (and two new Badge variants that consume them), the base tokens
 * left exactly as every other consumer already uses them.
 */
describe("globals.css: --destructive-text / --muted-foreground-accessible are defined for both themes", () => {
  const accessibleTokens = {
    light: {
      destructiveText: tokenValue(lightBlock, "destructive-text"),
      mutedForegroundAccessible: tokenValue(lightBlock, "muted-foreground-accessible"),
    },
    dark: {
      destructiveText: tokenValue(darkBlock, "destructive-text"),
      mutedForegroundAccessible: tokenValue(darkBlock, "muted-foreground-accessible"),
    },
  };

  it("both tokens are defined on :root (light) and redefined in the dark media block", () => {
    for (const name of ["destructiveText", "mutedForegroundAccessible"] as const) {
      expect(accessibleTokens.light[name]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(accessibleTokens.dark[name]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("is NOT registered in the @theme inline block (same Turbopack/Tailwind v4 quirk as --primary-text etc.)", () => {
    expect(css).not.toMatch(/--color-destructive-text:/);
    expect(css).not.toMatch(/--color-muted-foreground-accessible:/);
  });

  it("--destructive (fill token) is unchanged -- badges/buttons/borders/icons keep their exact color", () => {
    expect(tokenValue(lightBlock, "destructive")).toBe("#dc2626");
    expect(tokenValue(darkBlock, "destructive")).toBe("#ef4444");
  });

  it("--muted-foreground (default body-text token) is unchanged", () => {
    expect(tokenValue(lightBlock, "muted-foreground")).toBe("#64748b");
    expect(tokenValue(darkBlock, "muted-foreground")).toBe("#94a3b8");
  });

  it("--destructive-text passes 4.5:1 against a real destructive/10 badge fill (10% --destructive over --card/--background), in both themes", () => {
    function blend(fgHex: string, alpha: number, bgHex: string): string {
      const fg = hexToRgb(fgHex);
      const bg = hexToRgb(bgHex);
      return (
        "#" +
        fg
          .map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)))
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")
      );
    }
    const lightTint = blend(tokenValue(lightBlock, "destructive"), 0.1, tokens.light.background);
    expect(contrastRatio(accessibleTokens.light.destructiveText, lightTint)).toBeGreaterThanOrEqual(AA_NORMAL);
    const darkTint = blend(tokenValue(darkBlock, "destructive"), 0.1, tokens.dark.background);
    expect(contrastRatio(accessibleTokens.dark.destructiveText, darkTint)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("--muted-foreground-accessible passes 4.5:1 against --muted, in both themes", () => {
    expect(
      contrastRatio(accessibleTokens.light.mutedForegroundAccessible, tokenValue(lightBlock, "muted")),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(
      contrastRatio(accessibleTokens.dark.mutedForegroundAccessible, tokenValue(darkBlock, "muted")),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("src/ui/primitives/badge.tsx: destructive-accessible/muted-accessible variants exist and consume the tokens correctly", () => {
  const badgeSource = read("src/ui/primitives/badge.tsx");

  it("both variants are opt-in additions, not replacements of the existing destructive/muted variants", () => {
    expect(badgeSource).toMatch(/destructive:\s*"bg-destructive\/10 text-destructive border-destructive\/20"/);
    expect(badgeSource).toMatch(/muted:\s*"bg-muted text-muted-foreground border-border"/);
  });

  it("destructive-accessible keeps the same fill/border as destructive, only the text token differs, consumed as a raw var()", () => {
    expect(badgeSource).toMatch(
      /"destructive-accessible":\s*"bg-destructive\/10 text-\[var\(--destructive-text\)\] border-destructive\/20"/,
    );
  });

  it("muted-accessible keeps the same fill/border as muted, only the text token differs, consumed as a raw var()", () => {
    expect(badgeSource).toMatch(
      /"muted-accessible":\s*"bg-muted text-\[var\(--muted-foreground-accessible\)\] border-border"/,
    );
  });
});

/**
 * --warning-badge-text / --success-badge-text (follow-up to the destructive/muted closure above):
 * a live Lighthouse re-run on Home found the SAME defect on the "warning" Badge variant --
 * text-warning on bg-warning/10 measures 2.86:1 in light mode. Checking success's math the same
 * way showed the identical failure (2.96:1) even though nothing had reported it yet. The
 * "default"/primary variant's dark-mode failure (4.31:1) needed no new token: the existing
 * --primary-text already clears this tint with margin in both themes, it just was never applied
 * to Badge's own "default" variant -- hence "default-accessible" reuses it directly.
 */
describe("globals.css: --warning-badge-text / --success-badge-text are defined for both themes", () => {
  const badgeTextTokens = {
    light: {
      warningBadgeText: tokenValue(lightBlock, "warning-badge-text"),
      successBadgeText: tokenValue(lightBlock, "success-badge-text"),
    },
    dark: {
      warningBadgeText: tokenValue(darkBlock, "warning-badge-text"),
      successBadgeText: tokenValue(darkBlock, "success-badge-text"),
    },
  };

  function blendToken(fgHex: string, alpha: number, bgHex: string): string {
    const fg = hexToRgb(fgHex);
    const bg = hexToRgb(bgHex);
    return (
      "#" +
      fg
        .map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  it("both tokens are defined on :root (light) and redefined in the dark media block", () => {
    for (const name of ["warningBadgeText", "successBadgeText"] as const) {
      expect(badgeTextTokens.light[name]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(badgeTextTokens.dark[name]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("is NOT registered in the @theme inline block (same Turbopack/Tailwind v4 quirk as the other readable-text tokens)", () => {
    expect(css).not.toMatch(/--color-warning-badge-text:/);
    expect(css).not.toMatch(/--color-success-badge-text:/);
  });

  it("--warning/--success (fill tokens) are unchanged -- badges/buttons/borders/icons keep their exact color", () => {
    expect(tokens.light.warning).toBe("#d97706");
    expect(tokens.dark.warning).toBe("#f59e0b");
    expect(tokens.light.success).toBe("#16a34a");
    expect(tokens.dark.success).toBe("#22c55e");
  });

  it("--warning-badge-text passes 4.5:1 against a real bg-warning/10 badge fill, in both themes", () => {
    const lightTint = blendToken(tokens.light.warning, 0.1, tokens.light.background);
    expect(contrastRatio(badgeTextTokens.light.warningBadgeText, lightTint)).toBeGreaterThanOrEqual(AA_NORMAL);
    const darkTint = blendToken(tokens.dark.warning, 0.1, tokens.dark.background);
    expect(contrastRatio(badgeTextTokens.dark.warningBadgeText, darkTint)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("--success-badge-text passes 4.5:1 against a real bg-success/10 badge fill, in both themes", () => {
    const lightTint = blendToken(tokens.light.success, 0.1, tokens.light.background);
    expect(contrastRatio(badgeTextTokens.light.successBadgeText, lightTint)).toBeGreaterThanOrEqual(AA_NORMAL);
    const darkTint = blendToken(tokens.dark.success, 0.1, tokens.dark.background);
    expect(contrastRatio(badgeTextTokens.dark.successBadgeText, darkTint)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("--primary-text (already existing) passes 4.5:1 against a real bg-primary/10 badge fill, in both themes -- why 'default-accessible' needs no new token", () => {
    const lightTint = blendToken(tokens.light.primary, 0.1, tokens.light.background);
    expect(contrastRatio(tokens.light.primaryText, lightTint)).toBeGreaterThanOrEqual(AA_NORMAL);
    const darkTint = blendToken(tokens.dark.primary, 0.1, tokens.dark.background);
    expect(contrastRatio(tokens.dark.primaryText, darkTint)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("src/ui/primitives/badge.tsx: warning-accessible/success-accessible/default-accessible variants exist and consume the tokens correctly", () => {
  const badgeSource = read("src/ui/primitives/badge.tsx");

  it("the original warning/success/default variants are untouched", () => {
    expect(badgeSource).toMatch(/^\s*default:\s*"bg-primary\/10 text-primary border-primary\/20",$/m);
    expect(badgeSource).toMatch(/^\s*success:\s*"bg-success\/10 text-success border-success\/20",$/m);
    expect(badgeSource).toMatch(/^\s*warning:\s*"bg-warning\/10 text-warning border-warning\/20",$/m);
  });

  it("warning-accessible/success-accessible keep the same fill/border, only the text token differs", () => {
    expect(badgeSource).toMatch(
      /"warning-accessible":\s*"bg-warning\/10 text-\[var\(--warning-badge-text\)\] border-warning\/20"/,
    );
    expect(badgeSource).toMatch(
      /"success-accessible":\s*"bg-success\/10 text-\[var\(--success-badge-text\)\] border-success\/20"/,
    );
  });

  it("default-accessible keeps the same fill/border as default, reusing the existing --primary-text token", () => {
    expect(badgeSource).toMatch(
      /"default-accessible":\s*"bg-primary\/10 text-\[var\(--primary-text\)\] border-primary\/20"/,
    );
  });
});
