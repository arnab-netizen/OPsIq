import type { OperatorItem } from "@/domain/operator/types";
import type { TrustBadge, BadgeType } from "@/domain/badges/types";

const BADGE_RULES = {
  verifiedDecision: {
    minAccuracy: 0.8, // 80%
    minCompletions: 1, // at least 1 completed decision
  },
  highConfidence: {
    minConfidence: 0.75, // 75%
  },
  highImpact: {
    minImpact: 100000, // $100k
  },
};

const BADGE_DEFINITIONS: Record<BadgeType, { label: string; description: string }> = {
  "verified-decision": {
    label: "Verified Decision",
    description: "Actual outcome matched expectations with 80%+ accuracy",
  },
  "high-confidence": {
    label: "High Confidence",
    description: "Decision made with 75%+ confidence",
  },
  "high-impact": {
    label: "High Impact",
    description: "Expected business impact exceeds $100k",
  },
};

export function calculateBadges(item: OperatorItem): TrustBadge[] {
  const badges: TrustBadge[] = [];

  // Badge 1: Verified Decision (based on accuracy)
  if (
    item.status === "done" &&
    item.decisionAccuracy !== null &&
    item.decisionAccuracy !== undefined &&
    item.decisionAccuracy >= BADGE_RULES.verifiedDecision.minAccuracy
  ) {
    badges.push({
      type: "verified-decision",
      label: BADGE_DEFINITIONS["verified-decision"].label,
      description: BADGE_DEFINITIONS["verified-decision"].description,
    });
  }

  // Badge 2: High Confidence (based on confidence)
  if (item.confidence >= BADGE_RULES.highConfidence.minConfidence) {
    badges.push({
      type: "high-confidence",
      label: BADGE_DEFINITIONS["high-confidence"].label,
      description: BADGE_DEFINITIONS["high-confidence"].description,
    });
  }

  // Badge 3: High Impact (based on impact)
  if (item.impactExpected >= BADGE_RULES.highImpact.minImpact) {
    badges.push({
      type: "high-impact",
      label: BADGE_DEFINITIONS["high-impact"].label,
      description: BADGE_DEFINITIONS["high-impact"].description,
    });
  }

  return badges;
}

export function getBadgeVariant(
  type: BadgeType
): "default" | "success" | "warning" | "destructive" | "muted" {
  switch (type) {
    case "verified-decision":
      return "success";
    case "high-confidence":
      return "success";
    case "high-impact":
      return "warning";
    default:
      return "default";
  }
}
