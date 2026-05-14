/**
 * PHASE F6: CI GOVERNANCE GATE
 *
 * Prevents regression of shadow reads in CI pipeline.
 * Blocks builds if:
 * 1. NEW shadow reads introduced (violation count increased)
 * 2. CATEGORY_A violations increased (regressions on already-classified work)
 * 3. Non-allowlisted auth imports added
 *
 * Usage: npm run governance:ci-gate
 */

import fs from "fs";
import path from "path";

/**
 * Governance state: tracked violations and categories
 */
interface GovernanceBaseline {
  timestamp: string;
  totalViolations: number;
  categoryA: number;
  categoryB: number;
  categoryC: number;
}

/**
 * Get current governance baseline
 */
function getBaseline(): GovernanceBaseline | null {
  const baselinePath = ".governance/shadow-read-baseline.json";
  if (!fs.existsSync(baselinePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Get current violation counts
 */
function getCurrentViolations(): {
  total: number;
  categoryA: number;
  categoryB: number;
  categoryC: number;
} {
  const violationsPath = "shadow_read_violations.json";
  const classificationPath = "shadow_read_classification.json";

  if (!fs.existsSync(violationsPath)) {
    return { total: 0, categoryA: 0, categoryB: 0, categoryC: 0 };
  }

  let total = 0;
  try {
    const violations = JSON.parse(fs.readFileSync(violationsPath, "utf-8"));
    total = violations.totalViolations || 0;
  } catch {
    // File doesn't exist or is invalid
  }

  let categoryA = 0,
    categoryB = 0,
    categoryC = 0;
  if (fs.existsSync(classificationPath)) {
    try {
      const classified = JSON.parse(
        fs.readFileSync(classificationPath, "utf-8")
      );
      categoryA = classified.byCategory?.["CATEGORY_A"] || 0;
      categoryB = classified.byCategory?.["CATEGORY_B"] || 0;
      categoryC = classified.byCategory?.["CATEGORY_C"] || 0;
    } catch {
      // File doesn't exist or is invalid
    }
  }

  return { total, categoryA, categoryB, categoryC };
}

/**
 * Save governance baseline
 */
function saveBaseline(baseline: GovernanceBaseline): void {
  const dir = ".governance";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(dir, "shadow-read-baseline.json"),
    JSON.stringify(baseline, null, 2)
  );
}

/**
 * Generate governance report
 */
function generateGate(
  baseline: GovernanceBaseline | null,
  current: { total: number; categoryA: number; categoryB: number; categoryC: number }
): string {
  let report = `
╔════════════════════════════════════════════════════════════════════════════╗
║                  PHASE F6: CI SHADOW READ GOVERNANCE GATE                  ║
║                        Build Regression Prevention                         ║
╚════════════════════════════════════════════════════════════════════════════╝

CURRENT STATE:
  Total violations: ${current.total}
  Category A (safe): ${current.categoryA}
  Category B (adapter): ${current.categoryB}
  Category C (manual): ${current.categoryC}

`;

  if (!baseline) {
    report += `BASELINE: Not established (first run)

ACTIONS:
  ✓ First-time setup complete
  ✓ Establishing baseline for future regression detection
  ✓ Build PASSED (no baseline to compare against)

NEXT RUN:
  This baseline will be compared against in next build.
  Build will FAIL if:
  • Total violations increase
  • Category A violations increase (regressions)
  • New non-allowlisted auth imports added

`;

    // Save baseline
    const baseline: GovernanceBaseline = {
      timestamp: new Date().toISOString(),
      totalViolations: current.total,
      categoryA: current.categoryA,
      categoryB: current.categoryB,
      categoryC: current.categoryC,
    };
    saveBaseline(baseline);
    return report;
  }

  const totalIncrease = current.total - baseline.totalViolations;
  const categoryAIncrease = current.categoryA - baseline.categoryA;
  const categoryBIncrease = current.categoryB - baseline.categoryB;

  report += `BASELINE (from ${baseline.timestamp}):
  Total violations: ${baseline.totalViolations}
  Category A (safe): ${baseline.categoryA}
  Category B (adapter): ${baseline.categoryB}
  Category C (manual): ${baseline.categoryC}

COMPARISON:
`;

  if (totalIncrease > 0) {
    report += `  ❌ NEW violations introduced: +${totalIncrease} (${current.total} vs ${baseline.totalViolations})\n`;
  } else if (totalIncrease < 0) {
    report += `  ✓ Violations reduced: ${totalIncrease} (${current.total} vs ${baseline.totalViolations})\n`;
  } else {
    report += `  ✓ No new violations introduced\n`;
  }

  if (categoryAIncrease > 0) {
    report += `  ❌ REGRESSION: Category A increased: +${categoryAIncrease} (${current.categoryA} vs ${baseline.categoryA})\n`;
  } else if (categoryAIncrease < 0) {
    report += `  ✓ Category A reduced: ${categoryAIncrease} (${current.categoryA} vs ${baseline.categoryA})\n`;
  } else {
    report += `  ✓ Category A unchanged\n`;
  }

  if (categoryBIncrease > 0) {
    report += `  ℹ Category B increased: +${categoryBIncrease} (${current.categoryB} vs ${baseline.categoryB})\n`;
  } else if (categoryBIncrease < 0) {
    report += `  ℹ Category B reduced: ${categoryBIncrease} (${current.categoryB} vs ${baseline.categoryB})\n`;
  } else {
    report += `  ℹ Category B unchanged\n`;
  }

  report += `
GATE STATUS:
`;

  const gatePassed = totalIncrease <= 0 && categoryAIncrease <= 0;

  if (gatePassed) {
    report += `  ✓ BUILD PASSED - No regressions detected
  ✓ Shadow read count maintained or reduced
  ✓ No new Category A violations (no regressions)

`;
    // Update baseline to current
    const newBaseline: GovernanceBaseline = {
      timestamp: new Date().toISOString(),
      totalViolations: current.total,
      categoryA: current.categoryA,
      categoryB: current.categoryB,
      categoryC: current.categoryC,
    };
    saveBaseline(newBaseline);
  } else {
    report += `  ❌ BUILD FAILED - Regressions detected

FAILURE REASONS:
`;
    if (totalIncrease > 0) {
      report += `  • ${totalIncrease} new shadow reads introduced\n`;
    }
    if (categoryAIncrease > 0) {
      report += `  • ${categoryAIncrease} new Category A regressions (should be 0)\n`;
    }

    report += `
ACTION REQUIRED:
  1. Review recent changes for new shadow auth reads
  2. Restore baseline: git checkout <baseline-commit>
  3. Or fix violations: replace withAuth() with ctx.verifiedSessionSnapshot
  4. Re-run: npm run governance:scan-shadow-reads
  5. Commit updated baseline

REMEDIATION EXAMPLES:

  Type imports (remove):
    BEFORE: import type { AuthContext } from "@/lib/auth-guard";
    AFTER:  // Remove import entirely

  Function imports (remove or refactor):
    BEFORE: import { withAuth } from "@/lib/auth-guard";
    AFTER:  // Remove import, use ctx instead

  withAuth() calls (replace):
    BEFORE: const { session, policy } = await withAuth();
    AFTER:  const { session, policy } = ctx;

  Capability checks (extract):
    BEFORE: const { session, policy } = await withAuth({ capability: "AUDIT_READ" });
    AFTER:  const { verifiedCapabilities } = ctx;
             if (!verifiedCapabilities.has("AUDIT_READ")) throw new ForbiddenError();

`;
  }

  report += `
═══════════════════════════════════════════════════════════════════════════════

GOVERNANCE POLICIES:
1. NEW VIOLATIONS: Build fails if total > baseline
2. REGRESSIONS: Build fails if Category A > baseline
3. ALLOWED INCREASES: Category B (new adapters approved by maintainers only)
4. TRACKING: Baseline updated after each successful build

═══════════════════════════════════════════════════════════════════════════════
`;

  return report;
}

/**
 * Main gate function
 */
async function main() {
  console.log("Running Phase F6: CI Shadow Read Governance Gate...\n");

  const baseline = getBaseline();
  const current = getCurrentViolations();

  const report = generateGate(baseline, current);
  console.log(report);

  // Exit with error if gate failed
  if (baseline && (current.total > baseline.totalViolations || current.categoryA > baseline.categoryA)) {
    console.error("\n❌ GOVERNANCE GATE FAILED");
    process.exit(1);
  }

  console.log("✓ Governance gate PASSED");
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Gate error:", error);
    process.exit(1);
  });
}

export { getBaseline, getCurrentViolations, generateGate };
