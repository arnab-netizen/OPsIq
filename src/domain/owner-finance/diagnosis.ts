/**
 * Owner Finance (Module 2 Slice 3) — finance diagnosis orchestrator.
 *
 * Pure: computes Slice 2 metrics, emits risk + opportunity OwnerFindings,
 * deterministically ranks them, and produces a finance Spine `DomainScore`.
 * Does NOT create recommendations/actions (Slice 4) and persists nothing.
 */
import type { OwnerFinding, OwnerSeverity, DomainScore } from "@/domain/owner-spine/contracts";
import type { FinancialSnapshotInput, FinancialDerivedMetrics } from "./types";
import { computeFinancialMetrics } from "./metrics";
import { resolveFinanceThresholds } from "./thresholds";
import { buildFinanceRiskFindings } from "./risk-rules";
import { buildFinanceOpportunityFindings } from "./opportunity-rules";
import { missingCriticalFinanceInputs, type MissingInputPriority } from "./data-confidence";

/** A structured entry in the missing inputs registry. */
export interface MissingInputEntry {
  field: string;
  priority: MissingInputPriority;
  impact: string;
}

const MISSING_INPUT_IMPACT: Record<string, string> = {
  revenue: "profit margins, cash runway, survival risk score",
  costs: "profitability, cost structure, net margin",
  cashOnHand: "cash runway, survival risk, days of cash remaining",
  costOfGoodsOrServices: "gross margin calculation",
  fixedCosts: "structural vs. variable cost separation",
  salaryPayroll: "payroll sustainability assessment",
  loanEmiDebtPayments: "debt coverage and liquidity risk",
  receivables: "days-sales-outstanding, cash conversion",
  payables: "supplier payment risk",
  ownerWithdrawals: "owner cash drain analysis",
  orderCount: "revenue-per-order metric",
  customerCount: "revenue-per-customer metric",
  discountAmount: "discount impact on margins",
  refundAmount: "refund drain on gross margin",
};

const IMPORTANT_INPUT_FIELDS: (keyof FinancialSnapshotInput)[] = [
  "costOfGoodsOrServices", "fixedCosts", "salaryPayroll", "loanEmiDebtPayments",
  "receivables", "payables", "ownerWithdrawals", "orderCount", "customerCount",
  "discountAmount", "refundAmount",
];

/** Build a structured missing-inputs registry from a snapshot input. Deterministic, pure. */
export function buildMissingInputsRegistry(input: FinancialSnapshotInput): MissingInputEntry[] {
  const result: MissingInputEntry[] = [];
  const criticalFields = missingCriticalFinanceInputs(input);
  for (const field of criticalFields) {
    result.push({ field, priority: "CRITICAL", impact: MISSING_INPUT_IMPACT[field] ?? "diagnosis accuracy" });
  }
  for (const field of IMPORTANT_INPUT_FIELDS) {
    const value = input[field];
    if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
      result.push({ field: String(field), priority: "IMPORTANT", impact: MISSING_INPUT_IMPACT[String(field)] ?? "diagnosis accuracy" });
    }
  }
  return result;
}

const SEVERITY_RANK: Record<OwnerSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Deterministic finding order: severity desc → impact desc → urgency desc →
 * confidence desc → code asc. Pure; returns a new array.
 */
export function rankFinanceFindings(findings: OwnerFinding[]): OwnerFinding[] {
  return [...findings].sort((a, b) => {
    if (SEVERITY_RANK[b.severity] !== SEVERITY_RANK[a.severity]) {
      return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    }
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}

export interface FinanceDiagnosisResult {
  input: FinancialSnapshotInput;
  metrics: FinancialDerivedMetrics;
  findings: OwnerFinding[]; // all findings, ranked
  riskFindings: OwnerFinding[]; // ranked
  opportunityFindings: OwnerFinding[]; // ranked
  domainScore: DomainScore;
  missingCriticalData: string[];
  missingInputsRegistry: MissingInputEntry[];
  generatedAt: Date;
}

/** Diagnose a finance snapshot into ranked risk + opportunity findings + score. */
export function diagnoseFinanceSnapshot(
  input: FinancialSnapshotInput,
  opts: { now?: Date } = {}
): FinanceDiagnosisResult {
  const now = opts.now ?? new Date();
  const t = resolveFinanceThresholds(input.industryTemplate);
  const metrics = computeFinancialMetrics(input, { now });

  const riskFindings = rankFinanceFindings(buildFinanceRiskFindings(input, metrics, t));
  const opportunityFindings = rankFinanceFindings(buildFinanceOpportunityFindings(input, metrics, t));
  const findings = rankFinanceFindings([...riskFindings, ...opportunityFindings]);

  const domainScore: DomainScore = {
    domain: "finance",
    healthScore: metrics.financialHealthScore,
    riskScore: metrics.financialRiskScore,
    opportunityScore: metrics.financialOpportunityScore,
    dataConfidenceScore: metrics.dataConfidenceScore,
    topFindingCodes: riskFindings.slice(0, 3).map((f) => f.code),
    topActionCodes: [], // Slice 4
    generatedAt: now,
  };

  return {
    input,
    metrics,
    findings,
    riskFindings,
    opportunityFindings,
    domainScore,
    missingCriticalData: metrics.missingRequiredInputs,
    missingInputsRegistry: buildMissingInputsRegistry(input),
    generatedAt: now,
  };
}
