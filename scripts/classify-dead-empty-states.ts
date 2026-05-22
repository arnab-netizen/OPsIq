#!/usr/bin/env node

/**
 * Classify all DEAD_EMPTY_STATE patterns into 4 categories
 */

import fs from "fs";

interface Match {
  file: string;
  line: number;
  code: string;
  pattern: string;
}

interface ClassifiedItem {
  file: string;
  line: number;
  code: string;
  pattern: string;
  classification: string;
  reason: string;
  user_impact: string;
  priority: number;
}

function classifyMatch(match: Match): ClassifiedItem {
  const { file, line, code } = match;

  // Determine if this is a UI component or service
  const isUIComponent = file.includes("/ui/") || file.includes("/app/");
  const isService = file.includes("/services/");
  const isHook = file.includes("/hooks/");
  const isInfra = file.includes("/infra/") || file.includes("/lib/") || file.includes("/middleware/");

  // User-facing critical paths
  const criticalUI = [
    "kpi-trend.tsx",
    "decision-acceptance-modal.tsx",
    "alerts-panel.tsx",
    "intervention-recommendation-panel.tsx",
    "snapshot-review.tsx",
    "health-summary.tsx",
  ];

  const criticalServices = [
    "snapshot-optimization-engine.ts",
    "snapshot-engine.ts",
    "intervention-engine.ts",
    "health-check.ts",
  ];

  // Non-blocking or internal
  const deferrableUI = [
    "loading-state.tsx",
    "skeleton.tsx",
    "placeholder.tsx",
  ];

  const internalServices = [
    "auth.ts", // Authentication is critical but return null is for validation checks, not UI
    "diagnosis.ts", // Internal calculation helper
    "escalation.ts", // Internal logic
    "review-cycle.ts", // Internal workflow
  ];

  let classification = "DEFERRED"; // Default
  let reason = "Non-critical component or internal utility";
  let userImpact = "Low";
  let priority = 100;

  // Check for critical UI components
  if (isUIComponent) {
    for (const critical of criticalUI) {
      if (file.includes(critical)) {
        classification = "CRITICAL";
        reason = "Critical user-facing UI component";
        userImpact = "High - User sees blank screen with no guidance";
        priority = 1;
        break;
      }
    }
  }

  // Check for critical services
  if (isService && classification === "DEFERRED") {
    for (const critical of criticalServices) {
      if (file.includes(critical)) {
        classification = "CRITICAL";
        reason = "Critical service for core business operations";
        userImpact = "High - Silent failure in critical workflow";
        priority = 2;
        break;
      }
    }
  }

  // Check for internal-only services (these are likely FALSE_POSITIVE or DEFERRED)
  if (isService && classification === "DEFERRED") {
    for (const internal of internalServices) {
      if (file.includes(internal)) {
        // Auth service - return null is validation, should fix
        if (file.includes("auth.ts")) {
          if (
            code.includes("sessionToken") ||
            code.includes("session") ||
            code.includes("membership")
          ) {
            classification = "CRITICAL";
            reason = "Auth validation - silent failure could break entire flow";
            userImpact = "Critical - Auth failure";
            priority = 3;
          } else {
            classification = "DEFERRED";
            reason = "Auth utility function validation";
            userImpact = "Medium";
            priority = 50;
          }
        } else {
          classification = "DEFERRED";
          reason = "Internal service logic";
          userImpact = "Low";
          priority = 100;
        }
        break;
      }
    }
  }

  // Hooks should generally be deferred
  if (isHook && classification === "DEFERRED") {
    userImpact = "Medium";
    priority = 60;
  }

  // Infrastructure/middleware - check context
  if (isInfra) {
    if (
      file.includes("middleware/") ||
      file.includes("workspace-enforcement")
    ) {
      classification = "CRITICAL";
      reason = "Middleware/enforcement - returns null on fail";
      userImpact = "High - Silent auth/validation failure";
      priority = 5;
    } else {
      classification = "DEFERRED";
      reason = "Internal infrastructure utility";
      userImpact = "Low";
      priority = 90;
    }
  }

  return {
    ...match,
    classification,
    reason,
    user_impact: userImpact,
    priority,
  };
}

function main(): void {
  // Read the raw matches
  const rawMatches: Match[] = JSON.parse(
    fs.readFileSync(".claude/dead_empty_state_all_matches.json", "utf-8")
  );

  // Deduplicate by file:line
  const deduped = new Map<string, Match>();
  rawMatches.forEach((match) => {
    const key = `${match.file}:${match.line}`;
    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  });

  console.log(
    `Deduplicated from ${rawMatches.length} to ${deduped.size} unique items`
  );

  // Classify each
  const classified: ClassifiedItem[] = Array.from(deduped.values()).map(
    classifyMatch
  );

  // Count by classification
  const counts: Record<string, number> = {};
  classified.forEach((item) => {
    counts[item.classification] = (counts[item.classification] || 0) + 1;
  });

  console.log("\nClassification Summary:");
  console.log(counts);

  // Sort by priority
  classified.sort((a, b) => a.priority - b.priority);

  // Save to file
  fs.writeFileSync(
    ".claude/dead_empty_state_classified.json",
    JSON.stringify(
      {
        total_items: classified.length,
        classification_summary: counts,
        items_by_category: {
          critical: classified.filter(
            (i) => i.classification === "CRITICAL"
          ),
          deferred: classified.filter((i) => i.classification === "DEFERRED"),
          false_positive: classified.filter(
            (i) => i.classification === "FALSE_POSITIVE"
          ),
          needs_product_decision: classified.filter(
            (i) => i.classification === "NEEDS_PRODUCT_DECISION"
          ),
        },
        all_items_by_priority: classified,
      },
      null,
      2
    )
  );

  console.log("\nOutput: .claude/dead_empty_state_classified.json");
}

main();
