export interface FinancialImpactNormalized {
  revenueAtRiskPct: number | null;
  monthlyImpact: number | null;
  marginImpactPct: number | null;
  burnRateImpact: number | null;
  normalizedLevel: "unknown" | "low" | "medium" | "high" | "critical";
  reasons: string[];
}

export function normalizeFinancialImpact(input: {
  estimatedLoss?: number | null;
  revenue?: number | null;
}): FinancialImpactNormalized {
  const { estimatedLoss, revenue } = input;

  // If estimated loss is missing, null, or <= 0
  if (!estimatedLoss || estimatedLoss <= 0) {
    return {
      revenueAtRiskPct: null,
      monthlyImpact: null,
      marginImpactPct: null,
      burnRateImpact: null,
      normalizedLevel: "unknown",
      reasons: ["Estimated loss unavailable"],
    };
  }

  // Calculate monthly impact
  const monthlyImpact = Math.round((estimatedLoss / 3) * 100) / 100;

  // If revenue is missing, null, or <= 0
  if (!revenue || revenue <= 0) {
    return {
      revenueAtRiskPct: null,
      monthlyImpact,
      marginImpactPct: null,
      burnRateImpact: Math.round((monthlyImpact * 0.5) * 100) / 100,
      normalizedLevel: "unknown",
      reasons: ["Revenue unavailable; percentage impact cannot be normalized"],
    };
  }

  // Calculate with revenue
  const revenueAtRiskPct = Math.round((estimatedLoss / revenue) * 10000) / 100; // To 2 decimals
  const marginImpactPct = Math.round((revenueAtRiskPct * 0.6) * 100) / 100;
  const burnRateImpact = Math.round((monthlyImpact * 0.4) * 100) / 100;

  // Determine level based on revenueAtRiskPct
  let normalizedLevel: "unknown" | "low" | "medium" | "high" | "critical" = "low";
  if (revenueAtRiskPct >= 30) {
    normalizedLevel = "critical";
  } else if (revenueAtRiskPct >= 15) {
    normalizedLevel = "high";
  } else if (revenueAtRiskPct >= 5) {
    normalizedLevel = "medium";
  } else {
    normalizedLevel = "low";
  }

  const reasons: string[] = [
    `Revenue at risk: ${revenueAtRiskPct}% of annual revenue`,
    `Monthly impact: $${monthlyImpact.toLocaleString()}`,
  ];

  return {
    revenueAtRiskPct,
    monthlyImpact,
    marginImpactPct,
    burnRateImpact,
    normalizedLevel,
    reasons,
  };
}
