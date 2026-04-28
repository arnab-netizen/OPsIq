import type { DiagnosisV2Input, EvidenceSufficiencyV2, NormalizedFact, ValidationIssueV2 } from "@/domain/diagnosis-v2/types";
import { getNumberFact } from "./intake-normalization.engine";
import { isFiniteNumber, round } from "./utils";

function issue(input: Omit<ValidationIssueV2, "details"> & { details?: Record<string, unknown> }): ValidationIssueV2 {
  return { ...input, details: input.details ?? {} };
}

export function assessEvidenceSufficiency(_input: DiagnosisV2Input, facts: NormalizedFact[]): EvidenceSufficiencyV2 {
  const required: Array<[string, string, number]> = [
    ["problem.statement", "problemStatement", 0.22],
    ["finance.monthly_revenue", "monthlyRevenue", 0.22],
    ["finance.monthly_costs", "monthlyCosts", 0.22],
    ["customers.count", "customerCount", 0.12],
    ["finance.cash_on_hand", "cashOnHand", 0.1],
    ["evidence.labels", "evidenceLabels", 0.12],
  ];
  const present: string[] = [];
  const missing: string[] = [];
  let score = 0;

  for (const [factKey, fieldName, weight] of required) {
    if (facts.some((fact) => fact.key === factKey)) {
      present.push(fieldName);
      score += weight;
    } else {
      missing.push(fieldName);
    }
  }

  const minimumViable = !missing.includes("problemStatement") && !missing.includes("monthlyRevenue") && !missing.includes("monthlyCosts");
  const rationale = [
    present.length ? `Present: ${present.join(", ")}.` : "No required evidence present.",
    missing.length ? `Missing: ${missing.join(", ")}.` : "All required V2 evidence fields present.",
    minimumViable ? "Minimum viable diagnosis evidence is available." : "Diagnosis must remain needs_input until minimum evidence is supplied.",
  ];

  return { score: round(score, 2), minimumViable, missing, present, rationale };
}

export function validateDiagnosisFacts(input: DiagnosisV2Input, facts: NormalizedFact[]): ValidationIssueV2[] {
  const issues: ValidationIssueV2[] = [];
  const revenue = getNumberFact(facts, "finance.monthly_revenue");
  const costs = getNumberFact(facts, "finance.monthly_costs");
  const customers = getNumberFact(facts, "customers.count");
  const orders = getNumberFact(facts, "orders.count");
  const cash = getNumberFact(facts, "finance.cash_on_hand");
  const overdue = getNumberFact(facts, "finance.overdue_payables");
  const grossMarginPct = getNumberFact(facts, "finance.gross_margin_pct");
  const conversionRatePct = getNumberFact(facts, "sales.conversion_rate_pct");
  const repeatCustomerPct = getNumberFact(facts, "customers.repeat_pct");
  const staffCount = getNumberFact(facts, "people.staff_count");

  if (!input.engagementId || input.engagementId.trim().length < 6) {
    issues.push(issue({ issueType: "invalid_value", severity: "critical", message: "engagementId is missing or invalid.", fieldRefs: ["engagementId"], blocksCompletion: true }));
  }
  if (!input.nowIso || Number.isNaN(new Date(input.nowIso).getTime())) {
    issues.push(issue({ issueType: "invalid_value", severity: "critical", message: "nowIso must be supplied as a valid UTC ISO timestamp for deterministic runs.", fieldRefs: ["nowIso"], blocksCompletion: true }));
  }
  if (!input.problemStatement || input.problemStatement.trim().length < 12) {
    issues.push(issue({ issueType: "missing_data", severity: "high", message: "Problem statement is missing or too thin for diagnosis.", fieldRefs: ["problemStatement"], blocksCompletion: true }));
  }

  const numericFields: Array<[string, number | undefined, boolean]> = [
    ["monthlyRevenue", revenue, true],
    ["monthlyCosts", costs, true],
    ["customerCount", customers, false],
    ["orderCount", orders, false],
    ["cashOnHand", cash, false],
    ["overduePayables", overdue, false],
    ["staffCount", staffCount, false],
  ];
  for (const [field, value, blocks] of numericFields) {
    if (value === undefined) continue;
    if (!isFiniteNumber(value) || value < 0) {
      issues.push(issue({ issueType: "invalid_value", severity: blocks ? "critical" : "high", message: `${field} must be a finite non-negative number.`, fieldRefs: [field], blocksCompletion: blocks }));
    }
  }

  if (revenue === undefined) issues.push(issue({ issueType: "missing_data", severity: "high", message: "Monthly revenue is required for financial diagnosis.", fieldRefs: ["monthlyRevenue"], blocksCompletion: true }));
  if (costs === undefined) issues.push(issue({ issueType: "missing_data", severity: "high", message: "Monthly costs are required for financial diagnosis.", fieldRefs: ["monthlyCosts"], blocksCompletion: true }));
  if (customers === undefined) issues.push(issue({ issueType: "missing_data", severity: "medium", message: "Customer count is missing; revenue quality and concentration cannot be trusted.", fieldRefs: ["customerCount"], blocksCompletion: false }));

  if (customers === 0 && revenue !== undefined && revenue > 0) {
    issues.push(issue({ issueType: "contradiction", severity: "critical", message: "Revenue is positive but customer count is zero. Correct customer definition before relying on diagnosis.", fieldRefs: ["monthlyRevenue", "customerCount"], blocksCompletion: true, details: { revenue, customers } }));
  }
  if (orders !== undefined && customers !== undefined && orders < customers) {
    issues.push(issue({ issueType: "ambiguous_definition", severity: "medium", message: "Order count is lower than customer count. Confirm whether customerCount means unique customers, active accounts, or order count.", fieldRefs: ["orderCount", "customerCount"], blocksCompletion: false, details: { orders, customers } }));
  }
  if (revenue !== undefined && customers !== undefined && customers > 0) {
    const revenuePerCustomer = revenue / customers;
    if (revenuePerCustomer > 2500) {
      issues.push(issue({ issueType: "anomaly", severity: "high", message: "Revenue per customer is unusually high; this may indicate enterprise concentration, wrong unit definition, or bad data.", fieldRefs: ["monthlyRevenue", "customerCount"], blocksCompletion: false, details: { revenuePerCustomer: round(revenuePerCustomer, 2) } }));
    }
    if (revenuePerCustomer < 1) {
      issues.push(issue({ issueType: "anomaly", severity: "medium", message: "Revenue per customer is unusually low; verify revenue period and customer count definition.", fieldRefs: ["monthlyRevenue", "customerCount"], blocksCompletion: false, details: { revenuePerCustomer: round(revenuePerCustomer, 2) } }));
    }
  }
  if (revenue !== undefined && costs !== undefined && revenue > 0 && costs / revenue > 2.5) {
    issues.push(issue({ issueType: "anomaly", severity: "high", message: "Costs exceed revenue by more than 2.5x. Verify period matching before accepting action plan.", fieldRefs: ["monthlyRevenue", "monthlyCosts"], blocksCompletion: false, details: { costToRevenueRatio: round(costs / revenue, 2) } }));
  }
  if (cash !== undefined && overdue !== undefined && cash > 0 && overdue / cash > 2) {
    issues.push(issue({ issueType: "anomaly", severity: "high", message: "Overdue payables exceed available cash by more than 2x, indicating acute liquidity stress.", fieldRefs: ["cashOnHand", "overduePayables"], blocksCompletion: false, details: { payablesToCashRatio: round(overdue / cash, 2) } }));
  }
  if (grossMarginPct !== undefined && (grossMarginPct < -100 || grossMarginPct > 100)) {
    issues.push(issue({ issueType: "invalid_value", severity: "high", message: "grossMarginPct must be between -100 and 100.", fieldRefs: ["grossMarginPct"], blocksCompletion: false }));
  }
  for (const [field, value] of [["conversionRatePct", conversionRatePct], ["repeatCustomerPct", repeatCustomerPct]] as const) {
    if (value !== undefined && (value < 0 || value > 100)) {
      issues.push(issue({ issueType: "invalid_value", severity: "high", message: `${field} must be between 0 and 100.`, fieldRefs: [field], blocksCompletion: false }));
    }
  }

  return issues;
}
