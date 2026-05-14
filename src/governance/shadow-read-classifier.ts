/**
 * PHASE F5: SHADOW READ CLASSIFICATION
 *
 * Categorizes 418 shadow auth reads into replacement strategies:
 * - CATEGORY_A: Safe direct replacements (use ctx.verifiedSessionSnapshot)
 * - CATEGORY_B: Requires adapter (needs signature/context changes)
 * - CATEGORY_C: Unsafe/manual review (complex logic, side effects)
 *
 * Does NOT perform replacements - only classifies for remediation roadmap.
 */

import fs from "fs";
import path from "path";
import { glob } from "glob";

/**
 * Classification categories for shadow reads
 */
export const RemediationCategory = {
  CATEGORY_A: "CATEGORY_A",
  CATEGORY_B: "CATEGORY_B",
  CATEGORY_C: "CATEGORY_C",
} as const;

/**
 * Classified violation with remediation details
 */
export interface ClassifiedViolation {
  file: string;
  line: number;
  pattern: string;
  severity: string;
  category: keyof typeof RemediationCategory;
  context: string;
  reason: string;
  remediation: string;
  effort: "TRIVIAL" | "SMALL" | "MEDIUM" | "LARGE";
}

/**
 * Classification rules based on context and pattern
 */
function classifyViolation(
  file: string,
  line: number,
  pattern: string,
  context: string
): ClassifiedViolation {
  // Determine initial category based on pattern
  let category = RemediationCategory.CATEGORY_A;
  let reason = "";
  let remediation = "";
  let effort: "TRIVIAL" | "SMALL" | "MEDIUM" | "LARGE" = "SMALL";

  if (pattern === "auth-guard import") {
    // Import statements are simple: just remove or change to use ctx
    if (context.includes("type")) {
      // Type imports can be removed entirely
      category = RemediationCategory.CATEGORY_A;
      reason = "Type import only - can be removed";
      remediation = "Remove type import, use types from ctx instead";
      effort = "TRIVIAL";
    } else if (
      context.includes("requireCapabilityForService") ||
      context.includes("canDo") ||
      context.includes("getActorHierarchyLevel")
    ) {
      // Utility functions that work with auth context
      category = RemediationCategory.CATEGORY_B;
      reason =
        "Utility function import - needs refactoring to work with snapshot";
      remediation = "Extract utility into auth context or use policy check directly";
      effort = "SMALL";
    } else {
      // Other imports from auth-guard
      category = RemediationCategory.CATEGORY_A;
      reason = "Simple import - can be replaced with snapshot usage";
      remediation = "Remove import, use ctx.verifiedSessionSnapshot";
      effort = "TRIVIAL";
    }
  } else if (pattern === "withAuth()") {
    // withAuth() calls need context analysis
    if (context.includes("const {") || context.includes("const [")) {
      // Destructuring assignment
      if (context.includes("capability")) {
        // Capability check
        category = RemediationCategory.CATEGORY_B;
        reason = "withAuth() with capability check - needs policy extraction";
        remediation =
          "Replace with snapshot capability check from ctx.verifiedCapabilities";
        effort = "SMALL";
      } else {
        // Simple destructuring
        category = RemediationCategory.CATEGORY_A;
        reason = "withAuth() with simple destructuring";
        remediation =
          "Extract session/policy from ctx.verifiedSessionSnapshot and ctx.policy";
        effort = "SMALL";
      }
    } else if (context.includes("await withAuth()")) {
      // Awaited call
      category = RemediationCategory.CATEGORY_A;
      reason = "Awaited withAuth() - straightforward replacement";
      remediation =
        "Use const { session, policy } from ctx or snapshot directly";
      effort = "SMALL";
    } else if (
      context.includes("internalOnly") ||
      context.includes("scope")
    ) {
      // Complex options
      category = RemediationCategory.CATEGORY_B;
      reason = "withAuth() with complex scope/internal-only options";
      remediation =
        "Extract capability check from snapshot into separate policy check";
      effort = "MEDIUM";
    } else {
      // Default withAuth
      category = RemediationCategory.CATEGORY_A;
      reason = "Basic withAuth() call";
      remediation = "Replace with ctx.verifiedSessionSnapshot";
      effort = "SMALL";
    }
  } else if (pattern === "getServerAuthContext()") {
    // Optional auth context
    category = RemediationCategory.CATEGORY_B;
    reason = "getServerAuthContext() - returns null for missing auth";
    remediation =
      "Check ctx.verifiedSessionSnapshot exists, return null if handler not called";
    effort = "SMALL";
  } else if (pattern === "requireAuth()") {
    // Required auth
    category = RemediationCategory.CATEGORY_A;
    reason = "requireAuth() - can use snapshot directly";
    remediation =
      "Replace with direct snapshot access, throw if not in allowlisted context";
    effort = "SMALL";
  }

  return {
    file,
    line,
    pattern,
    severity: "CRITICAL",
    category,
    context,
    reason,
    remediation,
    effort,
  };
}

/**
 * Scan and classify all violations
 */
export async function classifyAllViolations(): Promise<ClassifiedViolation[]> {
  const violations = JSON.parse(
    fs.readFileSync("shadow_read_violations.json", "utf-8")
  );

  const classified: ClassifiedViolation[] = violations.violations.map(
    (v: any) => {
      return classifyViolation(v.file, v.line, v.pattern, v.context);
    }
  );

  return classified;
}

/**
 * Generate classification report
 */
export function generateClassificationReport(
  violations: ClassifiedViolation[]
): string {
  const byCategory = {
    [RemediationCategory.CATEGORY_A]: [] as ClassifiedViolation[],
    [RemediationCategory.CATEGORY_B]: [] as ClassifiedViolation[],
    [RemediationCategory.CATEGORY_C]: [] as ClassifiedViolation[],
  };

  violations.forEach((v) => {
    byCategory[v.category].push(v);
  });

  const effortByCategory = {
    [RemediationCategory.CATEGORY_A]: { TRIVIAL: 0, SMALL: 0, MEDIUM: 0, LARGE: 0 },
    [RemediationCategory.CATEGORY_B]: { TRIVIAL: 0, SMALL: 0, MEDIUM: 0, LARGE: 0 },
    [RemediationCategory.CATEGORY_C]: { TRIVIAL: 0, SMALL: 0, MEDIUM: 0, LARGE: 0 },
  };

  violations.forEach((v) => {
    effortByCategory[v.category][v.effort]++;
  });

  let report = `
╔════════════════════════════════════════════════════════════════════════════╗
║                    PHASE F5: SHADOW READ CLASSIFICATION                    ║
║                         Remediation Roadmap                                ║
╚════════════════════════════════════════════════════════════════════════════╝

TOTAL VIOLATIONS: ${violations.length}

CLASSIFICATION SUMMARY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CATEGORY_A (Safe Direct Replacements): ${byCategory[RemediationCategory.CATEGORY_A].length} violations
  └─ Can directly use ctx.verifiedSessionSnapshot
  └─ Effort: ${effortByCategory[RemediationCategory.CATEGORY_A].TRIVIAL} trivial + ${effortByCategory[RemediationCategory.CATEGORY_A].SMALL} small
  └─ No handler signature changes needed

CATEGORY_B (Requires Adapter): ${byCategory[RemediationCategory.CATEGORY_B].length} violations
  └─ Need wrapper/adapter to extract capability checks
  └─ Effort: ${effortByCategory[RemediationCategory.CATEGORY_B].SMALL} small + ${effortByCategory[RemediationCategory.CATEGORY_B].MEDIUM} medium + ${effortByCategory[RemediationCategory.CATEGORY_B].LARGE} large
  └─ Handler signature may need context parameter

CATEGORY_C (Unsafe/Manual Review): ${byCategory[RemediationCategory.CATEGORY_C].length} violations
  └─ Complex logic, side effects, or unclear context
  └─ Requires manual analysis and custom solutions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VIOLATION PATTERNS:
`;

  const byPattern: Record<string, number> = {};
  violations.forEach((v) => {
    byPattern[v.pattern] = (byPattern[v.pattern] || 0) + 1;
  });

  Object.entries(byPattern)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pattern, count]) => {
      report += `  • ${pattern}: ${count} violations\n`;
    });

  report += `

CATEGORY_A DETAILS (${byCategory[RemediationCategory.CATEGORY_A].length} violations):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remediation Strategy:
  1. Identify withAuth() calls and type imports
  2. Replace with ctx.verifiedSessionSnapshot and ctx.session
  3. Move capability checks to context builder
  4. No handler signature changes needed

Example Conversion (CATEGORY_A):
  BEFORE:
    const { session, policy } = await withAuth({ capability: AUDIT_READ });
    const role = session.user.role;

  AFTER:
    const { session, policy } = ctx;
    const { verifiedSessionSnapshot, verifiedCapabilities } = ctx;
    const role = verifiedSessionSnapshot.actor.roles[0].role;
    // AUDIT_READ already checked in wrapper

Affected Files:
`;

  const categoryAFiles = new Set(
    byCategory[RemediationCategory.CATEGORY_A].map((v) => v.file)
  );
  Array.from(categoryAFiles).slice(0, 10).forEach((file) => {
    const count = byCategory[RemediationCategory.CATEGORY_A].filter(
      (v) => v.file === file
    ).length;
    report += `  • ${file} (${count} violations)\n`;
  });

  if (categoryAFiles.size > 10) {
    report += `  ... and ${categoryAFiles.size - 10} more files\n`;
  }

  report += `

CATEGORY_B DETAILS (${byCategory[RemediationCategory.CATEGORY_B].length} violations):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remediation Strategy:
  1. Create adapter functions for complex capability checks
  2. Extract capability check logic into separate helper
  3. Pass context/snapshot to handlers that need capability checks
  4. May require handler signature changes

Example Conversion (CATEGORY_B):
  BEFORE:
    const { session, policy } = await withAuth({
      capability: SPECIFIC_CAPABILITY,
      scope: { type: "engagement", id: engagementId }
    });

  AFTER:
    const { verifiedCapabilities, verifiedSessionSnapshot } = ctx;
    if (!verifiedCapabilities.has("SPECIFIC_CAPABILITY")) {
      throw new ForbiddenError("Missing capability");
    }

Affected Files:
`;

  const categoryBFiles = new Set(
    byCategory[RemediationCategory.CATEGORY_B].map((v) => v.file)
  );
  Array.from(categoryBFiles).slice(0, 10).forEach((file) => {
    const count = byCategory[RemediationCategory.CATEGORY_B].filter(
      (v) => v.file === file
    ).length;
    report += `  • ${file} (${count} violations)\n`;
  });

  if (categoryBFiles.size > 10) {
    report += `  ... and ${categoryBFiles.size - 10} more files\n`;
  }

  report += `

CATEGORY_C DETAILS (${byCategory[RemediationCategory.CATEGORY_C].length} violations):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remediation Strategy:
  1. Manual review required per violation
  2. Analyze context and dependencies
  3. Determine custom solution for each
  4. May require architectural changes

Affected Files:
`;

  const categoryCFiles = new Set(
    byCategory[RemediationCategory.CATEGORY_C].map((v) => v.file)
  );
  Array.from(categoryCFiles).slice(0, 10).forEach((file) => {
    const count = byCategory[RemediationCategory.CATEGORY_C].filter(
      (v) => v.file === file
    ).length;
    report += `  • ${file} (${count} violations)\n`;
  });

  if (categoryCFiles.size > 10) {
    report += `  ... and ${categoryCFiles.size - 10} more files\n`;
  }

  report += `

REMEDIATION EFFORT ESTIMATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CATEGORY_A (Quick Wins):
  • Trivial (remove imports): ${effortByCategory[RemediationCategory.CATEGORY_A].TRIVIAL} violations (~1-2 min each)
  • Small (direct replacement): ${effortByCategory[RemediationCategory.CATEGORY_A].SMALL} violations (~5-10 min each)
  • TOTAL EFFORT: ~${effortByCategory[RemediationCategory.CATEGORY_A].TRIVIAL * 1 + effortByCategory[RemediationCategory.CATEGORY_A].SMALL * 7} minutes

CATEGORY_B (Moderate Effort):
  • Small (simple adapter): ${effortByCategory[RemediationCategory.CATEGORY_B].SMALL} violations (~15-30 min each)
  • Medium (context changes): ${effortByCategory[RemediationCategory.CATEGORY_B].MEDIUM} violations (~30-60 min each)
  • Large (signature changes): ${effortByCategory[RemediationCategory.CATEGORY_B].LARGE} violations (~60+ min each)
  • TOTAL EFFORT: ~${effortByCategory[RemediationCategory.CATEGORY_B].SMALL * 22 + effortByCategory[RemediationCategory.CATEGORY_B].MEDIUM * 45 + effortByCategory[RemediationCategory.CATEGORY_B].LARGE * 90} minutes

CATEGORY_C (Manual Review):
  • ${categoryCFiles.size} files require manual analysis
  • TOTAL EFFORT: Unknown (per-violation analysis required)

TOTAL ESTIMATED EFFORT:
  • CATEGORY_A: ~${effortByCategory[RemediationCategory.CATEGORY_A].TRIVIAL * 1 + effortByCategory[RemediationCategory.CATEGORY_A].SMALL * 7} minutes
  • CATEGORY_B: ~${effortByCategory[RemediationCategory.CATEGORY_B].SMALL * 22 + effortByCategory[RemediationCategory.CATEGORY_B].MEDIUM * 45 + effortByCategory[RemediationCategory.CATEGORY_B].LARGE * 90} minutes
  • TOTAL: ~${effortByCategory[RemediationCategory.CATEGORY_A].TRIVIAL * 1 + effortByCategory[RemediationCategory.CATEGORY_A].SMALL * 7 + effortByCategory[RemediationCategory.CATEGORY_B].SMALL * 22 + effortByCategory[RemediationCategory.CATEGORY_B].MEDIUM * 45 + effortByCategory[RemediationCategory.CATEGORY_B].LARGE * 90} minutes of development

═══════════════════════════════════════════════════════════════════════════════

NEXT STEPS:
1. F5: Classification COMPLETE (this report)
2. F6: CI Governance gate (block new shadows, track CATEGORY_A increase)
3. F7: Adversarial tests (enforce snapshot exclusivity)
4. Post-F7: Optional roadmap for F5 auto-remediation (CATEGORY_A first)

═══════════════════════════════════════════════════════════════════════════════
`;

  return report;
}

/**
 * CLI: Classify all violations and generate report
 */
async function main() {
  console.log("Classifying shadow auth reads...\n");

  const violations = await classifyAllViolations();
  const report = generateClassificationReport(violations);

  console.log(report);

  // Export classified violations as JSON
  const output = {
    timestamp: new Date().toISOString(),
    totalViolations: violations.length,
    byCategory: {
      [RemediationCategory.CATEGORY_A]: violations.filter(
        (v) => v.category === RemediationCategory.CATEGORY_A
      ).length,
      [RemediationCategory.CATEGORY_B]: violations.filter(
        (v) => v.category === RemediationCategory.CATEGORY_B
      ).length,
      [RemediationCategory.CATEGORY_C]: violations.filter(
        (v) => v.category === RemediationCategory.CATEGORY_C
      ).length,
    },
    violations,
  };

  fs.writeFileSync(
    "shadow_read_classification.json",
    JSON.stringify(output, null, 2)
  );
  console.log(
    "\nClassification report saved to shadow_read_classification.json"
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Classification error:", error);
    process.exit(1);
  });
}
