/**
 * Underinvestment Detection (Section 24). Pure, deterministic.
 *
 * Budget governance must detect HARMFUL underspend, not only overspend. It
 * distinguishes good savings, harmful underinvestment, delayed-necessary spend,
 * strategic underspend, and cash-preservation underspend — so the engine never
 * blindly praises cost-cutting that is actually damaging the business.
 */

export type UnderinvestmentClass =
  | "harmful_underinvestment"
  | "delayed_necessary_spend"
  | "good_savings"
  | "strategic_underspend"
  | "cash_preservation";

export interface UnderinvestmentInput {
  /** Is cash safe enough to invest? (Underspend while cash-unsafe = cash_preservation.) */
  cashSafe: boolean;
  revenueTargetMissed?: boolean;
  marketingUnderfunded?: boolean;
  maintenanceUnderfunded?: boolean;
  downtimeRising?: boolean;
  trainingUnderfunded?: boolean;
  reworkRising?: boolean;
  staffingUnderfunded?: boolean;
  delaysRising?: boolean;
  customerServiceUnderfunded?: boolean;
  churnRising?: boolean;
  qualityControlUnderfunded?: boolean;
  refundsRising?: boolean;
  salesUnderfunded?: boolean;
  pipelineWeak?: boolean;
}

export interface UnderinvestmentFinding {
  area: string;
  classification: UnderinvestmentClass;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  recommendedAction: string;
}

export interface UnderinvestmentResult {
  findings: UnderinvestmentFinding[];
  hasHarmful: boolean;
}

/** Classify one underfunded area against its adverse-trend signal. */
function classifyArea(underfunded: boolean | undefined, adverseTrend: boolean, cashSafe: boolean): UnderinvestmentClass | null {
  if (!underfunded) return null;
  if (adverseTrend) return cashSafe ? "harmful_underinvestment" : "delayed_necessary_spend";
  return cashSafe ? "good_savings" : "cash_preservation";
}

function sev(c: UnderinvestmentClass): UnderinvestmentFinding["severity"] {
  return c === "harmful_underinvestment" ? "HIGH" : c === "delayed_necessary_spend" ? "MEDIUM" : "LOW";
}

export function detectUnderinvestment(i: UnderinvestmentInput): UnderinvestmentResult {
  const findings: UnderinvestmentFinding[] = [];
  const add = (
    area: string,
    underfunded: boolean | undefined,
    adverseTrend: boolean,
    harm: string,
    action: string
  ) => {
    const c = classifyArea(underfunded, adverseTrend, i.cashSafe);
    if (!c) return;
    findings.push({
      area,
      classification: c,
      severity: sev(c),
      message: c === "harmful_underinvestment" ? harm : `${area} underfunded — classified ${c}.`,
      recommendedAction: c === "harmful_underinvestment" || c === "delayed_necessary_spend" ? action : "Continue monitoring; underspend is acceptable for now.",
    });
  };

  add("marketing", i.marketingUnderfunded, i.revenueTargetMissed === true, "Marketing underfunded while revenue target is missed and cash is safe.", "Fund a capped, proof-tracked acquisition test.");
  add("maintenance", i.maintenanceUnderfunded, i.downtimeRising === true, "Maintenance underfunded while downtime is rising.", "Restore preventive-maintenance budget to avoid revenue-impacting downtime.");
  add("training", i.trainingUnderfunded, i.reworkRising === true, "Training underfunded while rework is rising.", "Fund targeted training to cut rework cost.");
  add("staffing", i.staffingUnderfunded, i.delaysRising === true, "Staffing underfunded while delays are rising.", "Add capacity (staff/shift) to protect SLA and revenue.");
  add("customer_service", i.customerServiceUnderfunded, i.churnRising === true, "Customer service underfunded while churn is rising.", "Fund retention/service before new acquisition.");
  add("quality_control", i.qualityControlUnderfunded, i.refundsRising === true, "Quality control underfunded while refunds are rising.", "Restore QC budget to stop refund leakage.");
  add("sales", i.salesUnderfunded, i.pipelineWeak === true, "Sales underfunded while pipeline is weak.", "Fund proven sales activity to rebuild pipeline.");

  return { findings, hasHarmful: findings.some((f) => f.classification === "harmful_underinvestment") };
}
