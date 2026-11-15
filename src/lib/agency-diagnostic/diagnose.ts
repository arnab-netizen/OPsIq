/**
 * Agency Decision Diagnostic: pure decision logic (no I/O, nothing stored or transmitted).
 *
 * Thresholds follow the Parakeeto agency profitability guide (delivery margin above 50% of adjusted gross income,
 * overhead at or below 30% of it). The ORDER in which issues are ranked is an OpsIQ working heuristic, not a
 * published benchmark, and the page says so. Educational only; not financial advice.
 */

export type AgencyDiagnosticInput = {
  monthlyRevenue: number;
  passThroughCosts: number;
  deliveryCost: number;
  overhead: number;
  hoursLogged: number;
  hoursScoped: number;
  daysToCollect: number;
  cashReserveMonths: number;
  billableHours: number;
  capacityHours: number;
};

export type AgencyIssueKey = "DELIVERY_MARGIN_OVERSERVICING" | "OVERHEAD" | "CASH_RECEIVABLES" | "UTILIZATION_CAPACITY";

export type AgencyIssue = { key: AgencyIssueKey; score: number; why: string; next: string };

export type AgencyDiagnosticResult =
  | { ok: true; priority: AgencyIssue | null; others: AgencyIssue[]; noIssueMessage: string }
  | { ok: false; errors: string[] };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

const FIELD_LABELS: Record<keyof AgencyDiagnosticInput, string> = {
  monthlyRevenue: "Monthly revenue",
  passThroughCosts: "Pass-through costs",
  deliveryCost: "Delivery cost",
  overhead: "Overhead",
  hoursLogged: "Hours logged",
  hoursScoped: "Hours scoped",
  daysToCollect: "Days to collect",
  cashReserveMonths: "Cash reserve (months)",
  billableHours: "Billable hours",
  capacityHours: "Capacity hours",
};

export function validateAgencyInput(input: AgencyDiagnosticInput): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(FIELD_LABELS) as Array<keyof AgencyDiagnosticInput>) {
    const v = input[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) errors.push(`${FIELD_LABELS[key]} must be a number that is zero or more.`);
  }
  if (errors.length > 0) return errors;
  if (input.monthlyRevenue - input.passThroughCosts <= 0) errors.push("Revenue minus pass-through costs must be greater than zero.");
  if (input.hoursScoped <= 0) errors.push("Hours scoped must be greater than zero.");
  if (input.capacityHours <= 0) errors.push("Capacity hours must be greater than zero.");
  return errors;
}

export function diagnoseAgency(input: AgencyDiagnosticInput): AgencyDiagnosticResult {
  const errors = validateAgencyInput(input);
  if (errors.length > 0) return { ok: false, errors };

  const agi = input.monthlyRevenue - input.passThroughCosts;
  const deliveryMargin = (agi - input.deliveryCost) / agi;
  const overheadShare = input.overhead / agi;
  const netMargin = (agi - input.deliveryCost - input.overhead) / agi;
  const overservice = input.hoursLogged / input.hoursScoped - 1;
  const utilization = input.billableHours / input.capacityHours;

  const issues: AgencyIssue[] = [];
  if (overservice > 0.15 || deliveryMargin < 0.5) {
    issues.push({
      key: "DELIVERY_MARGIN_OVERSERVICING",
      score: 100,
      why:
        `Delivery margin is ${pct(deliveryMargin)} (guide: above 50%)` +
        (overservice > 0.15 ? `; your top clients logged ${pct(overservice)} more hours than were scoped` : "") +
        ". Every metric below inherits this one.",
      next: "Compare hours logged with hours scoped for your top five clients this month, then re-scope or reprice the worst one.",
    });
  }
  if (netMargin < 0.1 && deliveryMargin >= 0.5) {
    issues.push({
      key: "OVERHEAD",
      score: 80,
      why: `Net margin is ${pct(netMargin)} with a healthy delivery margin; overhead is ${pct(overheadShare)} of adjusted gross income (guide: 30% or less).`,
      next: "List your three largest overhead lines and cut or defer one.",
    });
  }
  if (input.cashReserveMonths < 2 || input.daysToCollect > 45) {
    issues.push({
      key: "CASH_RECEIVABLES",
      score: 60,
      why: `Cash reserve is ${input.cashReserveMonths} months and invoices take ${input.daysToCollect} days to collect on average.`,
      next: "Chase your three oldest invoices and move the slowest payer to shorter terms.",
    });
  }
  if (utilization < 0.5 || utilization > 0.85) {
    issues.push({
      key: "UTILIZATION_CAPACITY",
      score: 40,
      why: `Utilization is ${pct(utilization)} of capacity.`,
      next:
        utilization < 0.5
          ? "Find the unsold capacity: which team member has the most idle billable hours?"
          : "Check overload risk: pause new scope until you hire or reallocate.",
    });
  }
  issues.sort((a, b) => b.score - a.score);
  const [priority, ...others] = issues;
  return {
    ok: true,
    priority: priority ?? null,
    others,
    noIssueMessage: "None of the checked thresholds flagged. Re-run this quarterly.",
  };
}

/** Worked example shown as the form's starting values (not real data). */
export const AGENCY_EXAMPLE_INPUT: AgencyDiagnosticInput = {
  monthlyRevenue: 100000,
  passThroughCosts: 0,
  deliveryCost: 55000,
  overhead: 30000,
  hoursLogged: 120,
  hoursScoped: 100,
  daysToCollect: 38,
  cashReserveMonths: 2.5,
  billableHours: 700,
  capacityHours: 1000,
};

export const AGENCY_INPUT_FIELDS: ReadonlyArray<{ key: keyof AgencyDiagnosticInput; label: string; hint: string; step: string }> = [
  { key: "monthlyRevenue", label: "Monthly revenue ($)", hint: "Total billed in a typical recent month.", step: "100" },
  { key: "passThroughCosts", label: "Pass-through costs ($)", hint: "Ad spend or media you re-bill at cost.", step: "100" },
  { key: "deliveryCost", label: "Delivery cost ($)", hint: "Salaries and contractors who do client work.", step: "100" },
  { key: "overhead", label: "Overhead ($)", hint: "Rent, software, admin, sales and marketing.", step: "100" },
  { key: "hoursLogged", label: "Hours logged, top clients", hint: "Actual hours on your five biggest clients.", step: "1" },
  { key: "hoursScoped", label: "Hours scoped, top clients", hint: "Hours you priced for those same clients.", step: "1" },
  { key: "daysToCollect", label: "Average days to collect", hint: "From invoice to cash received.", step: "1" },
  { key: "cashReserveMonths", label: "Cash reserve (months)", hint: "Months of costs your cash would cover.", step: "0.1" },
  { key: "billableHours", label: "Billable hours", hint: "Hours billed to clients this month.", step: "1" },
  { key: "capacityHours", label: "Capacity hours", hint: "Hours your team could bill this month.", step: "1" },
];
