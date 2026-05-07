// Service for managing customer constraints
// Phase 2 Acceptance Criterion #3: "Customer constraints are captured"

import {
  CreateCustomerProfileRequest,
  CreateCustomerProfileRequestSchema,
  CustomerProfile,
  CustomerProfileSchema,
} from '../domain/customer-profile';

export class CustomerProfileService {
  // Pure function: check if customer profile indicates concentration risk
  static hasConcentrationRisk(profile: CustomerProfile | null): boolean {
    if (!profile) return false;

    // Risk scenarios:
    // - Top customer > 25% of revenue (material risk)
    // - Top 3 customers > 60% of revenue (high concentration)
    // - Explicit high/critical risk level
    // - Key customer dependency flag

    const highTopCustomer =
      profile.topCustomerPercentOfRevenue !== null &&
      profile.topCustomerPercentOfRevenue !== undefined &&
      profile.topCustomerPercentOfRevenue > 25;

    const highTop3 =
      profile.top3CustomersPercentOfRevenue !== null &&
      profile.top3CustomersPercentOfRevenue !== undefined &&
      profile.top3CustomersPercentOfRevenue > 60;

    const explicitRisk =
      profile.customerConcentrationRisk === 'high' ||
      profile.customerConcentrationRisk === 'critical';

    const keyDependency = profile.keyCustomerDependency === true;

    return highTopCustomer || highTop3 || explicitRisk || keyDependency;
  }

  // Pure function: check if customer health is concerning
  static hasHealthIssues(profile: CustomerProfile | null): boolean {
    if (!profile) return false;

    // Health issues:
    // - Health status is at_risk or critical
    // - High churn rate (> 5% monthly)
    // - Low satisfaction (< 60)
    // - Negative NPS (< 0)
    // - High risk customer count indicates problems

    const poorHealth =
      profile.customerHealthStatus === 'at_risk' || profile.customerHealthStatus === 'critical';

    const highChurn =
      profile.customerChurnRateMonthly !== null &&
      profile.customerChurnRateMonthly !== undefined &&
      profile.customerChurnRateMonthly > 0.05;

    const lowSatisfaction =
      profile.customerSatisfactionScore !== null &&
      profile.customerSatisfactionScore !== undefined &&
      profile.customerSatisfactionScore < 60;

    const negativeNPS =
      profile.npsScore !== null && profile.npsScore !== undefined && profile.npsScore < 0;

    const hasHighRiskCustomers =
      profile.highRiskCustomerCount !== null &&
      profile.highRiskCustomerCount !== undefined &&
      profile.highRiskCustomerCount > 0;

    return poorHealth || highChurn || lowSatisfaction || negativeNPS || hasHighRiskCustomers;
  }

  // Validate request structure
  static validateRequest(request: unknown): CreateCustomerProfileRequest {
    return CreateCustomerProfileRequestSchema.parse(request);
  }

  // Validate response structure
  static validateProfile(profile: unknown): CustomerProfile {
    return CustomerProfileSchema.parse(profile);
  }

  // Calculate customer health summary
  static assessCustomerHealth(profile: CustomerProfile): {
    healthScore: number; // 0-100
    riskFactors: string[];
    recommendations: string[];
  } {
    const riskFactors: string[] = [];
    let healthScore = 100;

    // Check concentration
    if (
      profile.topCustomerPercentOfRevenue !== null &&
      profile.topCustomerPercentOfRevenue !== undefined
    ) {
      if (profile.topCustomerPercentOfRevenue > 40) {
        riskFactors.push(`Critical concentration: Top customer ${profile.topCustomerPercentOfRevenue}% of revenue`);
        healthScore -= 30;
      } else if (profile.topCustomerPercentOfRevenue > 25) {
        riskFactors.push(`High concentration: Top customer ${profile.topCustomerPercentOfRevenue}% of revenue`);
        healthScore -= 15;
      }
    }

    // Check top 3
    if (
      profile.top3CustomersPercentOfRevenue !== null &&
      profile.top3CustomersPercentOfRevenue !== undefined
    ) {
      if (profile.top3CustomersPercentOfRevenue > 70) {
        riskFactors.push(`Top 3 customers ${profile.top3CustomersPercentOfRevenue}% of revenue`);
        healthScore -= 15;
      }
    }

    // Check churn
    if (
      profile.customerChurnRateMonthly !== null &&
      profile.customerChurnRateMonthly !== undefined
    ) {
      if (profile.customerChurnRateMonthly > 0.1) {
        riskFactors.push(`High churn: ${(profile.customerChurnRateMonthly * 100).toFixed(1)}% monthly`);
        healthScore -= 20;
      } else if (profile.customerChurnRateMonthly > 0.05) {
        riskFactors.push(`Churn concern: ${(profile.customerChurnRateMonthly * 100).toFixed(1)}% monthly`);
        healthScore -= 10;
      }
    }

    // Check satisfaction
    if (
      profile.customerSatisfactionScore !== null &&
      profile.customerSatisfactionScore !== undefined
    ) {
      if (profile.customerSatisfactionScore < 50) {
        riskFactors.push(`Poor satisfaction: ${profile.customerSatisfactionScore}/100`);
        healthScore -= 20;
      } else if (profile.customerSatisfactionScore < 70) {
        riskFactors.push(`Satisfaction concern: ${profile.customerSatisfactionScore}/100`);
        healthScore -= 10;
      }
    }

    // Check NPS
    if (profile.npsScore !== null && profile.npsScore !== undefined) {
      if (profile.npsScore < 0) {
        riskFactors.push(`Negative NPS: ${profile.npsScore}`);
        healthScore -= 15;
      }
    }

    // Check CAC payback
    if (
      profile.customerAcquisitionCostMonths !== null &&
      profile.customerAcquisitionCostMonths !== undefined
    ) {
      if (profile.customerAcquisitionCostMonths > 24) {
        riskFactors.push(`Long CAC payback: ${profile.customerAcquisitionCostMonths} months`);
        healthScore -= 10;
      }
    }

    const recommendations: string[] = [];
    if (healthScore < 40) {
      recommendations.push('Urgent: Customer concentration creates existential risk');
      recommendations.push('Increase customer acquisition immediately');
      recommendations.push('Improve satisfaction/retention');
    } else if (healthScore < 70) {
      recommendations.push('Diversify customer base');
      recommendations.push('Focus on churn reduction');
      recommendations.push('Monitor key account health closely');
    }

    return {
      healthScore: Math.max(0, healthScore),
      riskFactors,
      recommendations,
    };
  }
}
