/**
 * Unit Economics Engine Service
 *
 * Pure-function unit economics analysis: CAC, LTV, payback period,
 * LTV:CAC ratio, contribution margin, break-even, and retention value.
 * All methods are stateless — no in-memory store, no DB access.
 * Callers supply all input data; results are computed deterministically.
 *
 * Workspace isolation: every method checks that workspaceId is non-empty.
 * Cross-workspace blocking (metrics.workspaceId mismatch) is the caller's
 * responsibility where the metric object carries a workspaceId field.
 */
export class UnitEconomicsEngine {
  static calculateCAC(
    workspaceId: string,
    totalAcquisitionSpend: number,
    newCustomersAcquired: number
  ): {
    cac: number;
    status: "HEALTHY" | "CONCERNING" | "CRITICAL";
    message: string;
  } {
    if (!workspaceId) {
      return { cac: 0, status: "HEALTHY", message: "Workspace ID is required" };
    }

    if (newCustomersAcquired <= 0) {
      return { cac: 0, status: "CRITICAL", message: "No customers acquired" };
    }

    const cac = Math.round(totalAcquisitionSpend / newCustomersAcquired);
    let status: "HEALTHY" | "CONCERNING" | "CRITICAL";
    let message: string;

    if (cac < 50) {
      status = "HEALTHY";
      message = `CAC of $${cac} is healthy - low acquisition cost`;
    } else if (cac < 200) {
      status = "CONCERNING";
      message = `CAC of $${cac} is moderate - monitor efficiency`;
    } else {
      status = "CRITICAL";
      message = `CAC of $${cac} is high - acquisition inefficiency`;
    }

    return { cac, status, message };
  }

  static calculateLTV(
    workspaceId: string,
    avgMonthlyRevenue: number,
    avgMonthlyChurn: number,
    grossMargin: number
  ): {
    ltv: number;
    monthlyProfit: number;
    lifespan: number;
    message: string;
  } {
    if (!workspaceId) {
      return { ltv: 0, monthlyProfit: 0, lifespan: 0, message: "" };
    }

    if (avgMonthlyChurn <= 0 || avgMonthlyChurn >= 1) {
      return { ltv: 0, monthlyProfit: 0, lifespan: 0, message: "Invalid churn rate" };
    }

    const monthlyProfit = Math.round(avgMonthlyRevenue * grossMargin);
    const lifespan = Math.round(1 / avgMonthlyChurn);
    const ltv = Math.round(monthlyProfit * lifespan);
    const message = `LTV of $${ltv} over ~${lifespan} months (${Math.round(avgMonthlyChurn * 100)}% monthly churn)`;

    return { ltv, monthlyProfit, lifespan, message };
  }

  static calculateCACPayback(
    workspaceId: string,
    cac: number,
    monthlyProfit: number
  ): {
    paybackMonths: number;
    paybackStatus: "EXCELLENT" | "GOOD" | "ACCEPTABLE" | "POOR";
    recommendation: string;
  } {
    if (!workspaceId) {
      return { paybackMonths: 0, paybackStatus: "POOR", recommendation: "Workspace ID is required" };
    }

    if (monthlyProfit <= 0) {
      return { paybackMonths: Infinity, paybackStatus: "POOR", recommendation: "Business model is unprofitable" };
    }

    const paybackMonths = Math.round((cac / monthlyProfit) * 100) / 100;
    let paybackStatus: "EXCELLENT" | "GOOD" | "ACCEPTABLE" | "POOR";
    let recommendation: string;

    if (paybackMonths < 3) {
      paybackStatus = "EXCELLENT";
      recommendation = "Fast payback - efficient acquisition";
    } else if (paybackMonths < 6) {
      paybackStatus = "GOOD";
      recommendation = "Reasonable payback - acceptable efficiency";
    } else if (paybackMonths < 12) {
      paybackStatus = "ACCEPTABLE";
      recommendation = "Slow payback - consider improving margins or reducing CAC";
    } else {
      paybackStatus = "POOR";
      recommendation = "Very slow payback - unit economics need improvement";
    }

    return { paybackMonths, paybackStatus, recommendation };
  }

  static calculateLTVCACRatio(
    workspaceId: string,
    ltv: number,
    cac: number
  ): {
    ratio: number;
    health: "HEALTHY" | "AT_RISK" | "CRITICAL";
    recommendation: string;
  } {
    if (!workspaceId) {
      return { ratio: 0, health: "CRITICAL", recommendation: "Workspace ID is required" };
    }

    if (cac <= 0) {
      return { ratio: Infinity, health: "HEALTHY", recommendation: "No acquisition cost" };
    }

    const ratio = Math.round((ltv / cac) * 100) / 100;
    let health: "HEALTHY" | "AT_RISK" | "CRITICAL";
    let recommendation: string;

    if (ratio >= 3) {
      health = "HEALTHY";
      recommendation = `LTV:CAC ratio of ${ratio}:1 is healthy - customer value 3x+ acquisition cost`;
    } else if (ratio >= 1.5) {
      health = "AT_RISK";
      recommendation = `LTV:CAC ratio of ${ratio}:1 is at risk - needs improvement to reach 3:1 benchmark`;
    } else {
      health = "CRITICAL";
      recommendation = `LTV:CAC ratio of ${ratio}:1 is critical - unit economics are unsustainable`;
    }

    return { ratio, health, recommendation };
  }

  static calculateContributionMetrics(
    workspaceId: string,
    revenuePerUnit: number,
    variableCostPerUnit: number,
    fixedCostsPerMonth: number,
    unitsSoldPerMonth: number
  ): {
    contributionPerUnit: number;
    contributionMargin: number;
    contributionRatio: number;
    totalContribution: number;
    breakEvenUnits: number;
  } {
    if (!workspaceId) {
      return {
        contributionPerUnit: 0,
        contributionMargin: 0,
        contributionRatio: 0,
        totalContribution: 0,
        breakEvenUnits: 0,
      };
    }

    const contributionPerUnit = revenuePerUnit - variableCostPerUnit;
    const contributionMargin = Math.round((contributionPerUnit / revenuePerUnit) * 100) / 100;
    const contributionRatio = contributionMargin;
    const totalContribution = contributionPerUnit * unitsSoldPerMonth - fixedCostsPerMonth;
    const breakEvenUnits = fixedCostsPerMonth > 0
      ? Math.ceil(fixedCostsPerMonth / Math.max(contributionPerUnit, 1))
      : 0;

    return {
      contributionPerUnit: Math.round(contributionPerUnit),
      contributionMargin,
      contributionRatio,
      totalContribution: Math.round(totalContribution),
      breakEvenUnits,
    };
  }

  static assessUnitEconomicsHealth(
    workspaceId: string,
    ltv: number,
    cac: number,
    paybackMonths: number,
    monthlyProfit: number
  ): {
    overallHealth: "STRONG" | "MODERATE" | "WEAK";
    score: number;
    metrics: {
      ltvHealth: string;
      cacHealth: string;
      paybackHealth: string;
      profitabilityHealth: string;
    };
    recommendations: string[];
  } {
    if (!workspaceId) {
      return {
        overallHealth: "WEAK",
        score: 0,
        metrics: { ltvHealth: "", cacHealth: "", paybackHealth: "", profitabilityHealth: "" },
        recommendations: [],
      };
    }

    let score = 0;
    const metrics = { ltvHealth: "", cacHealth: "", paybackHealth: "", profitabilityHealth: "" };
    const recommendations: string[] = [];

    if (ltv >= cac * 3) {
      score += 25;
      metrics.ltvHealth = "STRONG";
    } else if (ltv >= cac * 1.5) {
      score += 12;
      metrics.ltvHealth = "MODERATE";
    } else {
      metrics.ltvHealth = "WEAK";
    }

    if (cac < 500) {
      score += 12;
      metrics.cacHealth = "MODERATE";
    } else if (cac < 1500) {
      score += 6;
      metrics.cacHealth = "INEFFICIENT_BUT_VIABLE";
    } else {
      metrics.cacHealth = "INEFFICIENT";
      recommendations.push("Review acquisition channels and reduce CAC");
    }

    if (paybackMonths <= 3) {
      score += 25;
      metrics.paybackHealth = "EXCELLENT";
    } else if (paybackMonths <= 6) {
      score += 12;
      metrics.paybackHealth = "GOOD";
    } else {
      metrics.paybackHealth = "SLOW";
      recommendations.push("Improve margins or reduce acquisition costs");
    }

    if (monthlyProfit > 0) {
      score += 25;
      metrics.profitabilityHealth = "PROFITABLE";
    } else if (monthlyProfit >= 0) {
      score += 12;
      metrics.profitabilityHealth = "BREAKEVEN";
    } else {
      metrics.profitabilityHealth = "UNPROFITABLE";
      recommendations.push("Increase prices or reduce costs");
    }

    const overallHealth = score >= 75 ? "STRONG" : score >= 50 ? "MODERATE" : "WEAK";
    return { overallHealth, score, metrics, recommendations };
  }

  static calculateRetentionValue(
    workspaceId: string,
    cac: number,
    monthlyProfit: number,
    monthlyChurnRate: number,
    retentionImprovementPercent: number
  ): {
    currentLTV: number;
    improvedLTV: number;
    ltvGain: number;
    payoffPeriod: number;
    recommendation: string;
  } {
    if (!workspaceId) {
      return { currentLTV: 0, improvedLTV: 0, ltvGain: 0, payoffPeriod: 0, recommendation: "" };
    }

    const currentLifespan = monthlyChurnRate > 0 ? 1 / monthlyChurnRate : 0;
    const currentLTV = Math.round(monthlyProfit * currentLifespan);

    const improvedChurnRate = Math.max(0, monthlyChurnRate * (1 - retentionImprovementPercent / 100));
    const improvedLifespan = improvedChurnRate > 0 ? 1 / improvedChurnRate : 0;
    const improvedLTV = Math.round(monthlyProfit * improvedLifespan);

    const ltvGain = improvedLTV - currentLTV;
    const payoffPeriod = cac > 0 ? Math.round(cac / (monthlyProfit || 1)) : 0;

    let recommendation: string;
    if (ltvGain > cac) {
      recommendation = `Reducing churn by ${retentionImprovementPercent}% gains $${ltvGain} LTV - pays back in ${payoffPeriod} months`;
    } else {
      recommendation = `Focus on acquisition efficiency - retention ROI is limited`;
    }

    return { currentLTV, improvedLTV, ltvGain, payoffPeriod, recommendation };
  }
}
