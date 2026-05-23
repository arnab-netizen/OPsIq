import {
  Engine,
  BusinessAssessment,
  EngineResult,
  EngineSignal,
} from "./contracts";

/**
 * DataValidationEngine
 * Validates input data quality and detects inconsistencies
 * Returns signals about data reliability that inform diagnostic confidence
 */

export class DataValidationEngine implements Engine {
  name = "DataValidation";

  async assess(input: BusinessAssessment): Promise<EngineResult> {
    const signals: EngineSignal[] = [];
    const issues: string[] = [];
    const metadata: Record<string, unknown> = {
      providedFields: this.countProvidedFields(input),
      dataQualityScore: 0,
    };

    // Check for revenue/customer mismatch
    if (input.customerCount && input.monthlyRevenue) {
      const revenuePerCustomer = input.monthlyRevenue / input.customerCount;

      if (revenuePerCustomer > 2000) {
        signals.push({
          source: "data_quality",
          severity: "medium",
          confidence: 0.8,
          message: "Revenue per customer unusually high",
          evidence: [
            `$${revenuePerCustomer.toFixed(2)} per customer suggests possible data error or premium positioning`,
          ],
        });
        issues.push(
          "Revenue per customer unusually high — verify customer count or pricing model"
        );
      }

      if (revenuePerCustomer < 10) {
        signals.push({
          source: "data_quality",
          severity: "medium",
          confidence: 0.8,
          message: "Revenue per customer unusually low",
          evidence: [
            `$${revenuePerCustomer.toFixed(2)} per customer suggests pricing or demand issue`,
          ],
        });
        issues.push(
          "Revenue per customer unusually low — possible pricing or demand issue"
        );
      }
    }

    // Check for severe cost overrun
    if (input.monthlyCosts && input.monthlyRevenue) {
      const costRatio = input.monthlyCosts / input.monthlyRevenue;

      if (costRatio > 2) {
        signals.push({
          source: "data_quality",
          severity: "high",
          confidence: 0.9,
          message: "Costs exceed revenue by >2x",
          evidence: [
            `Monthly costs: $${input.monthlyCosts}, Monthly revenue: $${input.monthlyRevenue}`,
          ],
        });
        issues.push(
          "Costs significantly exceed revenue — business may be in critical cash burn"
        );
      }
    }

    // Calculate data completeness
    const completeness = this.calculateDataCompleteness(input);
    metadata.dataCompleteness = completeness;

    if (completeness < 0.6) {
      signals.push({
        source: "data_quality",
        severity: "low",
        confidence: 0.7,
        message: "Limited financial data provided",
        evidence: ["Diagnosis based on narrative only; recommend gathering revenue/cost data"],
      });
    }

    // Data quality score: higher = more complete data
    metadata.dataQualityScore = this.calculateDataQualityScore(signals, completeness);

    return {
      engine: this.name,
      signals,
      issues,
      metadata,
    };
  }

  private countProvidedFields(input: BusinessAssessment): number {
    let count = 0;
    if (input.businessName) count++;
    if (input.businessType) count++;
    if (input.problemStatement) count++;
    if (input.mainIssue) count++;
    if (input.monthlyRevenue !== undefined) count++;
    if (input.monthlyCosts !== undefined) count++;
    if (input.customerCount !== undefined) count++;
    return count;
  }

  private calculateDataCompleteness(input: BusinessAssessment): number {
    const provided = this.countProvidedFields(input);
    const total = 7;
    return provided / total;
  }

  private calculateDataQualityScore(
    signals: EngineSignal[],
    completeness: number
  ): number {
    const signalPenalty = signals.reduce((acc, s) => {
      if (s.severity === "critical") return acc - 0.3;
      if (s.severity === "high") return acc - 0.15;
      if (s.severity === "medium") return acc - 0.05;
      return acc;
    }, 0);

    return Math.max(0, Math.min(1, completeness + signalPenalty));
  }
}
