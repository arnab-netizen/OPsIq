import type { DiagnosisV2Input, NormalizedFact } from "@/domain/diagnosis-v2/types";
import { isFiniteNumber } from "./utils";

function addFact(facts: NormalizedFact[], fact: Omit<NormalizedFact, "lineage"> & { lineage?: string[] }): void {
  facts.push({ ...fact, lineage: fact.lineage ?? [fact.key] });
}

function addTextFact(facts: NormalizedFact[], key: string, value: unknown, confidence: number): void {
  if (typeof value === "string" && value.trim().length > 0) {
    addFact(facts, { key, value: value.trim(), confidence, source: "user_input" });
  }
}

function addNumberFact(facts: NormalizedFact[], key: string, value: unknown, unit?: string, confidence = 0.9): void {
  if (isFiniteNumber(value)) {
    addFact(facts, { key, value, unit, confidence, source: "user_input" });
  }
}

export function normalizeDiagnosisInput(input: DiagnosisV2Input): NormalizedFact[] {
  const facts: NormalizedFact[] = [];
  addTextFact(facts, "business.name", input.businessName, 0.82);
  addTextFact(facts, "business.type", input.businessType, 0.82);
  addTextFact(facts, "problem.statement", input.problemStatement, 0.72);
  addTextFact(facts, "problem.main_issue_user_selected", input.mainIssue, 0.42);

  addNumberFact(facts, "finance.monthly_revenue", input.monthlyRevenue, "money/month");
  addNumberFact(facts, "finance.monthly_costs", input.monthlyCosts, "money/month");
  addNumberFact(facts, "finance.cash_on_hand", input.cashOnHand, "money");
  addNumberFact(facts, "finance.overdue_payables", input.overduePayables, "money");
  addNumberFact(facts, "finance.gross_margin_pct", input.grossMarginPct, "percent", 0.74);

  addNumberFact(facts, "customers.count", input.customerCount, "customers");
  addNumberFact(facts, "orders.count", input.orderCount, "orders/month");
  addNumberFact(facts, "customers.repeat_pct", input.repeatCustomerPct, "percent", 0.72);
  addNumberFact(facts, "sales.lead_count", input.leadCount, "leads/month", 0.72);
  addNumberFact(facts, "sales.conversion_rate_pct", input.conversionRatePct, "percent", 0.72);
  addNumberFact(facts, "customers.complaint_count", input.complaintCount, "complaints/month", 0.7);
  addNumberFact(facts, "people.staff_count", input.staffCount, "people", 0.72);

  if (Array.isArray(input.serviceLines) && input.serviceLines.length > 0) {
    addFact(facts, {
      key: "service.lines",
      value: input.serviceLines.map((line) => ({ ...line, name: String(line.name ?? "").trim() })).filter((line) => line.name),
      confidence: 0.68,
      source: "user_input",
    });
  }

  if (Array.isArray(input.evidenceLabels) && input.evidenceLabels.length > 0) {
    addFact(facts, {
      key: "evidence.labels",
      value: input.evidenceLabels.map((label) => label.trim()).filter(Boolean),
      confidence: 0.62,
      source: "evidence",
    });
  }

  if (input.additionalInputs && Object.keys(input.additionalInputs).length > 0) {
    addFact(facts, {
      key: "additional.inputs",
      value: input.additionalInputs,
      confidence: 0.48,
      source: "user_input",
    });
  }

  return facts;
}

export function getNumberFact(facts: NormalizedFact[], key: string): number | undefined {
  const value = facts.find((fact) => fact.key === key)?.value;
  return isFiniteNumber(value) ? value : undefined;
}

export function getTextFact(facts: NormalizedFact[], key: string): string | undefined {
  const value = facts.find((fact) => fact.key === key)?.value;
  return typeof value === "string" ? value : undefined;
}
