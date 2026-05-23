import {
  Engine,
  BusinessAssessment,
  EngineResult,
  EngineSignal,
} from "./contracts";

/**
 * FinancialEngine
 * Analyzes financial health: revenue, costs, cash flow, margins
 * Returns severity and category signals based on financial metrics
 */

export class FinancialEngine implements Engine {
  name = "Financial";

  async assess(input: BusinessAssessment): Promise<EngineResult> {
    const signals: EngineSignal[] = [];
    const issues: string[] = [];
    const metadata: Record<string, unknown> = {
      hasFinancialData: !!(input.monthlyRevenue || input.monthlyCosts),
    };

    // Analyze customer economics first (can signal critical even without financial data)
    if (input.customerCount === 0) {
      signals.push({
        source: "financial",
        severity: "critical",
        category: "revenue_generation",
        confidence: 0.95,
        message: "No sustainable customer base",
        evidence: [`Customer count: ${input.customerCount}`],
      });
    } else if (input.customerCount && input.customerCount < 5 && input.monthlyRevenue && input.monthlyRevenue > 0) {
      signals.push({
        source: "financial",
        severity: "high",
        category: "customer_retention",
        confidence: 0.85,
        message: "Very few customers (concentration risk)",
        evidence: [`Customer count: ${input.customerCount}`],
      });
    }

    // No financial data → low confidence financial assessment
    if (!input.monthlyRevenue && !input.monthlyCosts) {
      if (signals.length === 0) {
        signals.push({
          source: "financial",
          severity: "low",
          confidence: 0.3,
          message: "Insufficient financial data",
          evidence: ["No revenue or cost data provided"],
        });
      }
      return {
        engine: this.name,
        signals,
        issues,
        metadata,
      };
    }

    // Analyze cost vs revenue
    if (input.monthlyRevenue && input.monthlyCosts) {
      const loss = input.monthlyCosts - input.monthlyRevenue;
      const lossRatio = input.monthlyCosts / input.monthlyRevenue;

      metadata.monthlyLoss = loss;
      metadata.costToRevenueRatio = lossRatio;

      // Rule: costs > 125% revenue = critical
      if (lossRatio > 1.25) {
        signals.push({
          source: "financial",
          severity: "critical",
          category: "cost_control",
          confidence: 0.95,
          message: "Costs exceed revenue by >25%",
          evidence: [
            `Loss: $${Math.abs(loss).toLocaleString()} monthly`,
            `Cost ratio: ${(lossRatio * 100).toFixed(1)}%`,
          ],
        });
        issues.push(`Estimated monthly loss: $${Math.abs(loss).toLocaleString()}`);
      }

      // Rule: costs > revenue = high
      else if (lossRatio > 1) {
        signals.push({
          source: "financial",
          severity: "high",
          category: "cost_control",
          confidence: 0.9,
          message: "Costs exceed revenue",
          evidence: [
            `Loss: $${Math.abs(loss).toLocaleString()} monthly`,
            `Cost ratio: ${(lossRatio * 100).toFixed(1)}%`,
          ],
        });
        issues.push(`Monthly loss: $${Math.abs(loss).toLocaleString()}`);
      }

      // Rule: costs 80-100% of revenue = medium
      else if (lossRatio >= 0.8) {
        signals.push({
          source: "financial",
          severity: "medium",
          category: "cost_control",
          confidence: 0.85,
          message: "Costs consuming 80%+ of revenue",
          evidence: [`Margin: ${(100 - lossRatio * 100).toFixed(1)}%`],
        });
      }

      // Rule: costs < 80% of revenue = low (healthy)
      else {
        signals.push({
          source: "financial",
          severity: "low",
          category: "cost_control",
          confidence: 0.8,
          message: "Cost structure appears healthy",
          evidence: [`Margin: ${(100 - lossRatio * 100).toFixed(1)}%`],
        });
      }
    }

    // Analyze revenue scale
    if (input.monthlyRevenue) {
      metadata.revenueScale = this.classifyRevenueScale(input.monthlyRevenue);

      if (input.monthlyRevenue < 10000) {
        signals.push({
          source: "financial",
          severity: "medium",
          confidence: 0.7,
          message: "Low revenue scale",
          evidence: [`Monthly revenue: $${input.monthlyRevenue.toLocaleString()}`],
        });
      }
    }

    // Additional customer analytics
    if (input.customerCount && input.monthlyRevenue) {
      const revenuePerCustomer = input.monthlyRevenue / input.customerCount;
      metadata.revenuePerCustomer = revenuePerCustomer;
    }

    return {
      engine: this.name,
      signals,
      issues,
      metadata,
    };
  }

  private classifyRevenueScale(revenue: number): string {
    if (revenue < 10000) return "micro";
    if (revenue < 50000) return "small";
    if (revenue < 250000) return "medium";
    if (revenue < 1000000) return "large";
    return "enterprise";
  }
}
