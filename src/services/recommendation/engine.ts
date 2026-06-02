export interface BusinessAssessment {
  businessName: string;
  businessType: string;
  revenue: number;
  costs: number;
  customers: number;
}

export interface EngineRecommendation {
  title: string;
  description: string;
  priority: string;
  estimatedImpact: string;
  rationale: string;
}

export interface PersonalizedRecommendation {
  recommendation: EngineRecommendation;
  personalizationScore: number;
  suitabilityRationale: string[];
  businessContext: {
    sizeCategory: string;
    industryMatch: string;
    financialHealth: string;
  };
}

interface SizeWeight {
  small: number;
  medium: number;
  large: number;
  enterprise: number;
}

interface IndustryWeight {
  default: number;
  retail: number;
  saas: number;
  manufacturing: number;
  services: number;
}

interface HealthWeight {
  healthy: number;
  stressed: number;
  critical: number;
}

const SIZE_CATEGORIES = {
  small: (revenue: number) => revenue < 1000000,
  medium: (revenue: number) => revenue >= 1000000 && revenue < 10000000,
  large: (revenue: number) => revenue >= 10000000 && revenue < 100000000,
  enterprise: (revenue: number) => revenue >= 100000000,
};

const BASE_RECOMMENDATIONS: EngineRecommendation[] = [
  {
    title: "Revenue Optimization",
    description: "Implement dynamic pricing and upsell strategies to increase average revenue per customer",
    priority: "high",
    estimatedImpact: "5-15% revenue increase",
    rationale: "Most businesses leave 10-20% revenue on the table through suboptimal pricing",
  },
  {
    title: "Cost Reduction Program",
    description: "Audit operational expenses and renegotiate vendor contracts",
    priority: "high",
    estimatedImpact: "10-20% cost reduction",
    rationale: "Typical businesses have 8-15% unnecessary spend in vendor contracts and operations",
  },
  {
    title: "Customer Retention Focus",
    description: "Implement customer success program and reduce churn through targeted interventions",
    priority: "high",
    estimatedImpact: "3-8% revenue increase from retention",
    rationale: "Retaining 5% more customers can add 25-40% to profits for mature businesses",
  },
  {
    title: "Operational Efficiency",
    description: "Streamline processes and eliminate manual work through automation",
    priority: "medium",
    estimatedImpact: "15-25% time savings",
    rationale: "Most service businesses can automate 20-30% of current manual work",
  },
  {
    title: "Sales Cycle Acceleration",
    description: "Reduce sales cycle length and improve conversion rates",
    priority: "high",
    estimatedImpact: "10-20% faster cash collection",
    rationale: "Shortening sales cycles directly improves cash flow and reduces CAC payback",
  },
  {
    title: "Product-Market Fit Refinement",
    description: "Focus on highest-margin customer segments and product features",
    priority: "medium",
    estimatedImpact: "5-10% margin improvement",
    rationale: "Most businesses serve 3-5 highly profitable segments while subsidizing others",
  },
];

function getSizeCategory(revenue: number): string {
  if (SIZE_CATEGORIES.small(revenue)) return "small";
  if (SIZE_CATEGORIES.medium(revenue)) return "medium";
  if (SIZE_CATEGORIES.large(revenue)) return "large";
  return "enterprise";
}

function getFinancialHealth(revenue: number, costs: number): string {
  if (revenue <= 0) return "critical";
  const margin = (revenue - costs) / revenue;
  if (margin < 0.1) return "critical";
  if (margin < 0.2) return "stressed";
  return "healthy";
}

function calculateRecommendationScores(
  assessment: BusinessAssessment
): Map<string, number> {
  const scores = new Map<string, number>();
  const sizeCategory = getSizeCategory(assessment.revenue);
  const health = getFinancialHealth(assessment.revenue, assessment.costs);
  const margin = assessment.revenue > 0 ? (assessment.revenue - assessment.costs) / assessment.revenue : 0;

  const sizeWeights: SizeWeight = {
    small: 0.8,
    medium: 1.0,
    large: 1.2,
    enterprise: 1.3,
  };

  const industryWeights: IndustryWeight = {
    default: 1.0,
    retail: 1.1,
    saas: 1.3,
    manufacturing: 0.9,
    services: 1.0,
  };

  const healthWeights: HealthWeight = {
    healthy: 1.0,
    stressed: 1.2,
    critical: 1.5,
  };

  const sizeWeight = sizeWeights[sizeCategory as keyof SizeWeight] || sizeWeights.medium;
  const industryWeight = industryWeights[assessment.businessType.toLowerCase() as keyof IndustryWeight] || industryWeights.default;
  const healthWeight = healthWeights[health as keyof HealthWeight] || healthWeights.healthy;

  // Revenue Optimization: higher for businesses with pricing challenges
  let revenueOptScore = 0.7 * sizeWeight * industryWeight;
  if (assessment.customers > 100) revenueOptScore += 0.15; // High customer count = upsell potential
  if (margin < 0.3) revenueOptScore += 0.1; // Low margin = pricing power
  scores.set("Revenue Optimization", revenueOptScore);

  // Cost Reduction: higher for businesses with cost pressure
  let costScore = 0.8 * healthWeight * industryWeight;
  if (margin < 0.2) costScore += 0.2; // Urgent if margin is low
  if (assessment.costs > assessment.revenue * 0.85) costScore += 0.15;
  scores.set("Cost Reduction Program", costScore);

  // Customer Retention: scales with customer base
  let retentionScore = 0.7 * sizeWeight;
  if (assessment.customers >= 100) retentionScore += 0.2;
  if (assessment.customers >= 1000) retentionScore += 0.15;
  scores.set("Customer Retention Focus", retentionScore);

  // Operational Efficiency: for all sizes
  let efficiencyScore = 0.6 * sizeWeight * industryWeight;
  if (sizeCategory === "medium" || sizeCategory === "large") efficiencyScore += 0.2;
  scores.set("Operational Efficiency", efficiencyScore);

  // Sales Cycle: critical for low customer counts
  let salesScore = 0.7;
  if (assessment.customers < 50) salesScore += 0.3;
  if (sizeCategory === "small") salesScore += 0.15;
  scores.set("Sales Cycle Acceleration", salesScore);

  // Product-Market Fit: for scaling businesses
  let productScore = 0.5 * sizeWeight;
  if (sizeCategory === "medium" || sizeCategory === "large") productScore += 0.3;
  scores.set("Product-Market Fit Refinement", productScore);

  return scores;
}

export function generatePersonalizedRecommendations(
  assessment: BusinessAssessment,
  includedCategories?: string[]
): PersonalizedRecommendation[] {
  const scores = calculateRecommendationScores(assessment);
  const sizeCategory = getSizeCategory(assessment.revenue);
  const health = getFinancialHealth(assessment.revenue, assessment.costs);

  const recommendations: PersonalizedRecommendation[] = BASE_RECOMMENDATIONS
    .filter((rec) => !includedCategories || includedCategories.includes(rec.title))
    .map((rec) => {
      const score = scores.get(rec.title) || 0.5;
      const normalizedScore = Math.min(score, 1.0);

      const rationale: string[] = [];

      if (rec.title === "Revenue Optimization") {
        rationale.push(`Your business size (${sizeCategory}) has significant pricing leverage`);
        if (assessment.customers > 100) {
          rationale.push(`With ${assessment.customers} customers, upsell can add 10-15% revenue`);
        }
      } else if (rec.title === "Cost Reduction Program") {
        rationale.push(`Financial health: ${health} - cost focus will improve margins`);
        const margin = assessment.revenue > 0 ? (assessment.revenue - assessment.costs) / assessment.revenue : 0;
        if (margin < 0.2) {
          rationale.push("Margin is below industry average - cost reduction is critical");
        }
      } else if (rec.title === "Customer Retention Focus") {
        if (assessment.customers >= 100) {
          rationale.push(`Your customer base of ${assessment.customers} has significant retention value`);
        }
        rationale.push("Retention economics: acquiring new customers costs 5-7x more than retaining existing");
      } else if (rec.title === "Operational Efficiency") {
        if (sizeCategory === "medium" || sizeCategory === "large") {
          rationale.push(`At ${sizeCategory} scale, efficiency gains compound significantly`);
        }
      } else if (rec.title === "Sales Cycle Acceleration") {
        if (assessment.customers < 50) {
          rationale.push("Early-stage business growth is limited by sales capacity");
        }
        rationale.push("Shorter cycles improve cash flow and reduce customer acquisition cost payback");
      } else if (rec.title === "Product-Market Fit Refinement") {
        if (sizeCategory === "medium" || sizeCategory === "large") {
          rationale.push(`Mature businesses like yours benefit from segment focus`);
        }
      }

      return {
        recommendation: rec,
        personalizationScore: normalizedScore,
        suitabilityRationale: rationale,
        businessContext: {
          sizeCategory,
          industryMatch: assessment.businessType,
          financialHealth: health,
        },
      };
    })
    .sort((a, b) => b.personalizationScore - a.personalizationScore);

  return recommendations;
}

export function scoreRecommendationForBusiness(
  recommendation: EngineRecommendation,
  assessment: BusinessAssessment
): number {
  const scores = calculateRecommendationScores(assessment);
  return scores.get(recommendation.title) || 0.5;
}
