export interface RevenueStream {
  id: string;
  name: string;
  monthlyValue: number;
}

export interface CostCategory {
  id: string;
  name: string;
  monthlyCost: number;
  type: "fixed" | "variable";
}

export interface FinancialBaseline {
  revenue: RevenueStream[];
  costs: CostCategory[];
  period: "monthly";
}

export interface ImpactEstimate {
  impactLow: number;
  impactExpected: number;
  impactHigh: number;
  confidenceWeight: number;
}
