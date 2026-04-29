export type BadgeType = "verified-decision" | "high-confidence" | "high-impact";

export interface TrustBadge {
  type: BadgeType;
  label: string;
  description: string;
}

export interface BadgeRules {
  verifiedDecision: {
    minAccuracy: number; // accuracy >= 80%
    minCompletions: number; // at least 1 completed decision
  };
  highConfidence: {
    minConfidence: number; // confidence >= 75%
  };
  highImpact: {
    minImpact: number; // impact >= $100k
  };
}
