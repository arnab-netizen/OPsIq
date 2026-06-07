/**
 * Deterministic problem-signal extraction for diagnosis specificity.
 *
 * Pure, testable, explainable. No AI/LLM, no embeddings, no external calls,
 * no randomness, no timestamps. Same input → identical output.
 *
 * It turns the user's own words (problemStatement) and numbers (revenue, costs,
 * customers) into concrete signals so findings, reasons, and the first action
 * reflect THIS business rather than only a category template.
 */

export interface SignalInput {
  businessType: string;
  problemStatement: string;
  mainIssue: string;
  monthlyRevenue?: number;
  monthlyCosts?: number;
  customerCount?: number;
}

export type ConstraintKey =
  | "cash_flow_pressure"
  | "capacity_constraint"
  | "weak_lead_flow"
  | "weak_retention"
  | "conversion_gap"
  | "pricing_pressure"
  | "inventory_lock"
  | "quality_issue"
  | "delivery_dependency"
  | "staffing_issue"
  | "sales_process_gap"
  | "marketing_gap"
  | "operational_inefficiency";

export interface ProblemSignals {
  tags: ConstraintKey[];
  primaryConstraint: ConstraintKey | null;
  metrics: {
    marginPct: number | null;
    negativeMargin: boolean;
    revenuePerCustomer: number | null;
    costRatio: number | null;
  };
  evidence: string[];
  statementQuote: string;
}

// Keyword → signal. Substring match on the lowercased problem statement.
// Ordered groups; each constraint lists its trigger substrings.
const KEYWORD_RULES: Array<{ key: ConstraintKey; words: string[] }> = [
  { key: "weak_retention", words: ["repeat", "return", "retention", "churn", "loyal", "come back", "one-time", "one time"] },
  { key: "capacity_constraint", words: ["capacity", "machine", "fully booked", "overbook", "keep up", "bottleneck", "max out", "maxed"] },
  { key: "weak_lead_flow", words: ["lead", "pipeline", "prospect", "inbound", "inconsistent flow", "no inquiries", "few inquiries", "not enough customers"] },
  { key: "conversion_gap", words: ["conver", "signup", "sign up", "activation", "onboard", "trial", "drop off", "drop-off", "dropoff", "abandon"] },
  { key: "pricing_pressure", words: ["pric", "discount", "undercharge", "too cheap", "race to the bottom"] },
  { key: "inventory_lock", words: ["inventory", "stock", "overstock", "cash locked", "tied up", "tied-up", "unsold"] },
  { key: "cash_flow_pressure", words: ["cash flow", "cashflow", "runway", "burn", "late payment", "receivable", "can't pay", "cant pay"] },
  { key: "quality_issue", words: ["qualit", "complaint", "defect", "refund", "bad review", "rework"] },
  { key: "delivery_dependency", words: ["deliver", "fulfil", "logistics", "shipping", "platform", "aggregator", "commission"] },
  { key: "staffing_issue", words: ["staff", "employee", "hire", "turnover", "reliab", "absent", "no-show", "no show"] },
  { key: "sales_process_gap", words: ["sales process", "no process", "follow up", "follow-up", "not closing", "can't close", "cant close"] },
  { key: "marketing_gap", words: ["market", "advertis", "awareness", "visib", "no one knows", "unknown brand"] },
  { key: "operational_inefficiency", words: ["operation", "manual", "inefficien", "delay", "slow process", "disorganiz", "disorganis"] },
];

// Deterministic precedence: which detected constraint becomes "primary".
const CONSTRAINT_PRECEDENCE: ConstraintKey[] = [
  "cash_flow_pressure",
  "capacity_constraint",
  "weak_lead_flow",
  "weak_retention",
  "conversion_gap",
  "pricing_pressure",
  "inventory_lock",
  "quality_issue",
  "delivery_dependency",
  "staffing_issue",
  "sales_process_gap",
  "marketing_gap",
  "operational_inefficiency",
];

const CONSTRAINT_PHRASE: Record<ConstraintKey, string> = {
  cash_flow_pressure: "cash-flow pressure",
  capacity_constraint: "a capacity constraint",
  weak_lead_flow: "inconsistent lead flow",
  weak_retention: "weak repeat-customer generation",
  conversion_gap: "a signup/activation (conversion) gap",
  pricing_pressure: "pricing pressure",
  inventory_lock: "cash locked in inventory",
  quality_issue: "a product/service quality issue",
  delivery_dependency: "dependence on delivery/fulfilment channels",
  staffing_issue: "staffing reliability",
  sales_process_gap: "a missing sales process",
  marketing_gap: "low market visibility",
  operational_inefficiency: "operational inefficiency",
};

export function constraintPhrase(key: ConstraintKey): string {
  return CONSTRAINT_PHRASE[key];
}

function truncate(s: string, n: number): string {
  const clean = s.trim().replace(/\s+/g, " ");
  return clean.length <= n ? clean : `${clean.slice(0, n).trimEnd()}…`;
}

export function extractProblemSignals(input: SignalInput): ProblemSignals {
  const statement = (input.problemStatement || "").toLowerCase();

  const tags: ConstraintKey[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((w) => statement.includes(w))) {
      tags.push(rule.key);
    }
  }

  // Derived metrics (only when numbers are present).
  const rev = input.monthlyRevenue;
  const cost = input.monthlyCosts;
  const cust = input.customerCount;

  const marginPct =
    rev !== undefined && cost !== undefined && rev > 0
      ? Math.round(((rev - cost) / rev) * 100)
      : null;
  const negativeMargin =
    rev !== undefined && cost !== undefined ? cost > rev : false;
  const revenuePerCustomer =
    rev !== undefined && cust !== undefined && cust > 0
      ? Math.round(rev / cust)
      : null;
  const costRatio =
    rev !== undefined && cost !== undefined && rev > 0
      ? Math.round((cost / rev) * 100) / 100
      : null;

  // Pick primary constraint by fixed precedence (deterministic).
  let primaryConstraint: ConstraintKey | null = null;
  for (const key of CONSTRAINT_PRECEDENCE) {
    if (tags.includes(key)) {
      primaryConstraint = key;
      break;
    }
  }
  // If numbers strongly indicate cash pressure, that takes precedence.
  if (negativeMargin) primaryConstraint = "cash_flow_pressure";

  // Build concrete, non-fabricated evidence from the user's own facts.
  const evidence: string[] = [];
  if (primaryConstraint && tags.includes(primaryConstraint)) {
    evidence.push(`Your problem statement points to ${CONSTRAINT_PHRASE[primaryConstraint]}.`);
  }
  if (negativeMargin && rev !== undefined && cost !== undefined) {
    evidence.push(`Monthly costs ($${cost.toLocaleString()}) exceed revenue ($${rev.toLocaleString()}).`);
  } else if (marginPct !== null) {
    evidence.push(`Reported monthly margin is about ${marginPct}% ($${(rev as number).toLocaleString()} revenue vs $${(cost as number).toLocaleString()} costs).`);
  }
  if (revenuePerCustomer !== null) {
    evidence.push(`Revenue per customer is about $${revenuePerCustomer} across ${cust} customers.`);
  } else if (cust !== undefined) {
    evidence.push(`Reported customer count: ${cust}.`);
  }
  if (evidence.length === 0) {
    evidence.push(`Limited detail provided — based on your stated problem: "${truncate(input.problemStatement, 120)}".`);
  }

  return {
    tags,
    primaryConstraint,
    metrics: { marginPct, negativeMargin, revenuePerCustomer, costRatio },
    evidence,
    statementQuote: truncate(input.problemStatement, 120),
  };
}

/** One concise, evidence-grounded line for a specific finding. */
export function findingEvidence(input: SignalInput, signals: ProblemSignals): string {
  // Always returns the strongest available concrete fact; never fabricated.
  return signals.evidence[0];
}

/** Deterministic "why this matters now" for the top finding. */
export function deriveWhyThisMattersNow(signals: ProblemSignals, category: string, severity: string): string {
  if (signals.metrics.negativeMargin) {
    return "Costs currently exceed revenue, so the gap compounds every month it goes unaddressed.";
  }
  switch (signals.primaryConstraint) {
    case "weak_retention":
      return "You are adding customers but few return, so acquisition spend is not compounding into a stable base.";
    case "weak_lead_flow":
      return "Without a steady lead flow, revenue stays unpredictable and capacity sits idle between spikes.";
    case "capacity_constraint":
      return "Demand is hitting a capacity ceiling, so extra marketing would be wasted until throughput improves.";
    case "conversion_gap":
      return "Traffic is arriving but not activating, so every new visitor is a missed conversion until the gap is fixed.";
    case "inventory_lock":
      return "Cash is locked in unsold stock, limiting the working capital available to operate and grow.";
    case "cash_flow_pressure":
      return "Cash timing is tight, so a single slow month could threaten day-to-day operations.";
    default:
      return `At ${severity} severity, this is the issue most likely to worsen near-term if left unaddressed.`;
  }
}

/** Deterministic "why this is first" for the top recommendation. */
export function deriveWhyFirst(signals: ProblemSignals, category: string, severity: string): string {
  const lever = signals.primaryConstraint
    ? CONSTRAINT_PHRASE[signals.primaryConstraint]
    : category.replace(/_/g, " ");
  return `This is first because ${lever} is the binding constraint, and at ${severity} severity addressing it has the largest near-term effect before other work pays off.`;
}

/** Short bottleneck label for the action being addressed. */
export function deriveBottleneck(signals: ProblemSignals, category: string): string {
  if (signals.primaryConstraint) {
    const p = CONSTRAINT_PHRASE[signals.primaryConstraint];
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  return category.replace(/_/g, " ");
}

/** Prefix the first action with a reference to the user's own problem/constraint. */
export function enrichFirstActionDescription(original: string, signals: ProblemSignals): string {
  const ref = signals.primaryConstraint
    ? `Your inputs indicate ${CONSTRAINT_PHRASE[signals.primaryConstraint]}.`
    : `Based on your stated problem ("${signals.statementQuote}").`;
  return `${ref} ${original}`;
}

/** Deterministic guardrails to prevent premature actions. */
export function deriveWhatNotToDoYet(signals: ProblemSignals): string[] {
  const out: string[] = [];
  const t = signals.tags;
  if (t.includes("weak_lead_flow")) {
    out.push("Don't hire more delivery/serving staff yet — stabilise lead flow first.");
  }
  if (t.includes("capacity_constraint")) {
    out.push("Don't increase marketing spend yet — you can't serve more demand until capacity is addressed.");
  }
  if (t.includes("weak_retention")) {
    out.push("Don't expand acquisition spend yet — fix repeat usage before pouring in new customers.");
  }
  if (t.includes("conversion_gap")) {
    out.push("Don't drive more top-of-funnel traffic yet — fix activation/conversion first.");
  }
  if (t.includes("inventory_lock")) {
    out.push("Don't reorder more inventory yet — free up the cash already tied in stock first.");
  }
  if (signals.metrics.negativeMargin || t.includes("cash_flow_pressure")) {
    out.push("Don't take on new fixed costs yet — stabilise cash first.");
  }
  return out;
}
