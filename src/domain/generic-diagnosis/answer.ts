/**
 * Generic (consultant quick-intake) diagnosis — the evidence-grounded answer contract.
 *
 * A consultant enters what a client business reported. The answer is written about "the business".
 * Pure and deterministic: no I/O, no clock, no randomness. Same input → identical output.
 *
 * It answers only what the submitted evidence supports:
 *  - the three optional figures (monthly revenue, monthly costs, customer count) are the only
 *    measurable evidence; a figure that was not entered is UNKNOWN, never 0;
 *  - the problem statement and the selected concern are the client's own account — recorded as
 *    a concern to test, never as a proven finding, and never judged "supported" from totals alone
 *    (a gap between costs and revenue cannot say whether costs or revenue cause it);
 *  - nothing is inferred from keywords, no canned advice is issued, and no percentage appears that
 *    is not calculated from this business's own figures (no external benchmarks are used);
 *  - a difference between revenue and costs smaller than 1% of revenue is treated as breaking
 *    even, not as a loss — rounding noise is never presented as a problem.
 *
 * When the evidence cannot support a conclusion the answer abstains ("I can't determine that yet.")
 * and says what can be concluded, what cannot, and exactly what to provide next.
 */

export const GENERIC_DIAGNOSIS_MAIN_ISSUES = [
  "low_sales",
  "high_costs",
  "cash_flow",
  "customer_retention",
  "operations",
  "unclear",
] as const;
export type GenericDiagnosisMainIssue = (typeof GENERIC_DIAGNOSIS_MAIN_ISSUES)[number];

export interface GenericDiagnosisInput {
  businessName: string;
  businessType: string;
  problemStatement: string;
  mainIssue: GenericDiagnosisMainIssue;
  /** Omitted = not known. 0 = reported as zero. */
  monthlyRevenue?: number;
  monthlyCosts?: number;
  customerCount?: number;
}

/** Where a piece of evidence or a reason comes from. */
export type Provenance =
  | "owner_input" // a figure the business reported (entered by the consultant; not independently verified)
  | "owner_statement" // the business's own description / selected concern
  | "calculated"; // arithmetic on owner_input figures only

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  owner_input: "Reported figure — not independently verified",
  owner_statement: "As described",
  calculated: "Calculated from the reported figures",
};

export interface EvidenceItem {
  key: string;
  label: string;
  value: string;
  provenance: Provenance;
}

export interface Reason {
  text: string;
  provenance: Provenance;
}

export interface Step {
  title: string;
  why: string;
}

export interface MissingInformation {
  field: string;
  why: string;
}

export type DiagnosisCertainty = "high" | "medium" | "low" | "cannot_determine";
export type EvidenceStrength = "owner_reported_figures" | "description_only";

export interface DiagnosisConfidence {
  /** How many of the three measurable figures were entered. */
  dataCompleteness: { provided: number; total: number; label: string };
  /** What kind of evidence the conclusion rests on. */
  evidenceStrength: { level: EvidenceStrength; label: string };
  /** How sure the main-problem statement is, given the evidence above. */
  certainty: { level: DiagnosisCertainty; label: string; explanation: string };
}

export type MainProblemCode =
  | "costs_exceed_revenue"
  | "no_revenue_against_costs"
  | "profitable_concern_unconfirmed"
  | "no_trading_activity_reported"
  | "insufficient_evidence";

export type Severity = "critical" | "high" | "medium" | "low";

export interface GenericDiagnosisAnswer {
  status: "concluded" | "insufficient_evidence";
  mainProblem: { code: MainProblemCode; headline: string; detail: string };
  why: Reason[];
  evidence: EvidenceItem[];
  confidence: DiagnosisConfidence;
  whatThisMeans: string;
  /** Exactly one primary next step. */
  firstStep: Step;
  /** Follow-up steps coherent with the first step (never a competing priority). */
  thenSteps: Step[];
  doNotDoYet: Step[];
  missingInformation: MissingInformation[];
  canConclude: string[];
  cannotConclude: string[];
  /** The client's own concern, recorded as something to test — never a finding. */
  statedConcern: { mainIssue: GenericDiagnosisMainIssue; label: string; quote: string; status: "not_yet_tested" };
  dataWarnings: string[];
  /** Supporting detail (never the lead). null = not determined from the evidence. */
  supporting: {
    severity: Severity | null;
    economics: EconomicsState;
    monthlyGap: number | null;
    marginPct: number | null;
    revenuePerCustomer: number | null;
  };
}

export type EconomicsState =
  | "loss" // revenue > 0 and costs exceed revenue by at least 1% of revenue
  | "no_revenue_loss" // revenue = 0 and costs > 0
  | "breakeven" // revenue > 0 and costs within 1% of revenue (either side)
  | "profit" // revenue > 0 and costs below revenue by at least 1% of revenue
  | "zero_activity" // revenue = 0 and costs = 0 (both reported)
  | "partial" // exactly one of revenue / costs entered
  | "unknown"; // neither entered

/** A revenue/costs difference below this share of revenue is breaking even, not a loss or a profit. */
const BREAKEVEN_TOLERANCE = 0.01;

export const MAIN_ISSUE_LABEL: Record<GenericDiagnosisMainIssue, string> = {
  low_sales: "low sales",
  high_costs: "high costs",
  cash_flow: "cash flow",
  customer_retention: "customers not coming back",
  operations: "operations",
  unclear: "not sure yet",
};

/** Evidence that would let each stated concern be tested (what to ask for next). */
const CONCERN_EVIDENCE: Record<GenericDiagnosisMainIssue, MissingInformation[]> = {
  low_sales: [{ field: "Monthly revenue for each of the last 6 months", why: "Shows whether sales are actually falling, flat or seasonal — one month cannot show a trend." }],
  high_costs: [{ field: "Monthly costs broken down by line (rent, staff, materials, …)", why: "Shows which costs drive the total, so a cut can be targeted instead of guessed." }],
  cash_flow: [
    { field: "Cash in the bank today", why: "Shows how long the business can run at its current rate." },
    {
      field: "Week-by-week money in and out, including loan repayments, owner drawings, stock purchases and tax",
      why: "Shows when and why cash runs short — monthly revenue and cost totals can't.",
    },
  ],
  customer_retention: [{ field: "How many customers bought in each of the last two periods, and how many bought in both", why: "The only way to measure whether customers are coming back." }],
  operations: [{ field: "Where work gets stuck: what waits, how long, and how often (orders, jobs, deliveries, rework)", why: "An operational bottleneck has to be observed; it cannot be inferred from a category." }],
  unclear: [{ field: "What changed recently and what the business wants to be different", why: "Gives the diagnosis a question to answer." }],
};

/** The step that tests each concern; used as a follow-up when the figures set a different first step. */
const CONCERN_TEST_STEP: Record<GenericDiagnosisMainIssue, Step | null> = {
  low_sales: { title: "Compare monthly revenue for the last 6 months", why: "Shows whether falling sales are part of the problem, or whether revenue is flat or seasonal." },
  high_costs: null, // the loss first step (cost breakdown) already tests it
  cash_flow: null, // the months-of-cash step already tests it
  customer_retention: { title: "Count how many of last period's customers bought again this period", why: "Shows whether losing customers is part of the problem." },
  operations: { title: "Record for two weeks where work gets stuck — what waits, for how long, how often", why: "Shows whether an operational bottleneck is part of the problem." },
  unclear: null,
};

/** Amounts in the currency the figures were reported in (none is assumed). Small values keep decimals. */
function fmtAmount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
}

/** One decimal place (matches owner finance's net margin rounding); a real minus sign. */
function fmtPct(p: number): string {
  return `${p < 0 ? "−" : ""}${Math.abs(p).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

/** A usable reported figure: finite and not negative. Anything else is treated as not entered. */
function has(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function quote(statement: string): string {
  const clean = statement.trim().replace(/\s+/g, " ");
  return clean.length <= 160 ? clean : `${clean.slice(0, 160).trimEnd()}…`;
}

export function economicsState(input: Pick<GenericDiagnosisInput, "monthlyRevenue" | "monthlyCosts">): EconomicsState {
  const rev = input.monthlyRevenue;
  const cost = input.monthlyCosts;
  if (has(rev) && has(cost)) {
    if (rev > 0) {
      const diff = cost - rev;
      if (Math.abs(diff) < rev * BREAKEVEN_TOLERANCE) return "breakeven";
      return diff > 0 ? "loss" : "profit";
    }
    return cost > 0 ? "no_revenue_loss" : "zero_activity";
  }
  if (has(rev) || has(cost)) return "partial";
  return "unknown";
}

/** The stated concern as a reason (never a finding). "Not sure yet" is stated as no concern chosen. */
function concernReason(issue: GenericDiagnosisMainIssue): Reason {
  return issue === "unclear"
    ? { text: "No specific concern was chosen.", provenance: "owner_statement" }
    : { text: `Stated concern: ${MAIN_ISSUE_LABEL[issue]}.`, provenance: "owner_statement" };
}

export function buildGenericDiagnosisAnswer(input: GenericDiagnosisInput): GenericDiagnosisAnswer {
  const rev = input.monthlyRevenue;
  const cost = input.monthlyCosts;
  const cust = input.customerCount;
  const issue = input.mainIssue;
  const concernLabel = MAIN_ISSUE_LABEL[issue];
  const statementQuote = quote(input.problemStatement);
  const state = economicsState(input);

  // ── Evidence (only what was submitted, plus arithmetic on it) ─────────────────────────────────
  const evidence: EvidenceItem[] = [];
  if (has(rev)) evidence.push({ key: "monthlyRevenue", label: "Monthly revenue", value: fmtAmount(rev), provenance: "owner_input" });
  if (has(cost)) evidence.push({ key: "monthlyCosts", label: "Monthly costs", value: fmtAmount(cost), provenance: "owner_input" });
  if (has(cust)) evidence.push({ key: "customerCount", label: "Customers", value: cust.toLocaleString("en-US"), provenance: "owner_input" });

  const monthlyGap = (state === "loss" || state === "no_revenue_loss") && has(rev) && has(cost) ? cost - rev : null;
  const marginPct = has(rev) && has(cost) && rev > 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : null;
  const revenuePerCustomer = has(rev) && has(cust) && cust > 0 ? Math.round((rev / cust) * 100) / 100 : null;
  if (monthlyGap !== null) evidence.push({ key: "monthlyGap", label: "Monthly shortfall (costs − revenue)", value: fmtAmount(monthlyGap), provenance: "calculated" });
  if (marginPct !== null) evidence.push({ key: "marginPct", label: "Margin (revenue − costs) ÷ revenue", value: fmtPct(marginPct), provenance: "calculated" });
  if (revenuePerCustomer !== null) evidence.push({ key: "revenuePerCustomer", label: "Monthly revenue per customer", value: fmtAmount(revenuePerCustomer), provenance: "calculated" });
  evidence.push({ key: "problemStatement", label: "Problem as described", value: `“${statementQuote}”`, provenance: "owner_statement" });

  // ── Data consistency (flag, never correct silently) ──────────────────────────────────────────
  const dataWarnings: string[] = [];
  if (has(cust) && cust === 0 && has(rev) && rev > 0) {
    dataWarnings.push("0 customers was entered with revenue above 0. Check the customer count — revenue per customer can't be worked out.");
  }
  if (has(cost) && cost === 0 && has(rev) && rev > 0) {
    dataWarnings.push("Monthly costs of 0 were entered with revenue above 0. Check that no costs were left out.");
  }
  if (state === "zero_activity" && has(cust) && cust > 0) {
    dataWarnings.push("Customers were entered, but revenue and costs are both 0. Check the figures.");
  }

  // ── Completeness / evidence strength ─────────────────────────────────────────────────────────
  const provided = [rev, cost, cust].filter(has).length;
  const dataCompleteness = {
    provided,
    total: 3,
    label: `${provided} of 3 figures entered (monthly revenue, monthly costs, customers)`,
  };
  const evidenceStrength: DiagnosisConfidence["evidenceStrength"] =
    provided > 0
      ? { level: "owner_reported_figures", label: "Reported figures for one month — not yet checked against records" }
      : { level: "description_only", label: "The description only — no figures entered" };

  const concernMissing = CONCERN_EVIDENCE[issue];
  const figureMissing: MissingInformation[] = [];
  if (!has(rev)) figureMissing.push({ field: "Monthly revenue", why: "Needed to tell whether the business covers its costs. Enter 0 only if it really is zero." });
  if (!has(cost)) figureMissing.push({ field: "Monthly costs", why: "Needed to tell whether the business covers its costs. Enter 0 only if it really is zero." });
  const customerMissing: MissingInformation[] = has(cust) ? [] : [{ field: "Number of customers", why: "Lets revenue per customer be worked out." }];

  // ── Loss: the numbers themselves show the main problem ───────────────────────────────────────
  if ((state === "loss" || state === "no_revenue_loss") && has(rev) && has(cost) && monthlyGap !== null) {
    // Critical only when the gap is large relative to the business (over 25% of revenue). With no
    // revenue there is no scale to judge size against, so it is "high" — never escalated as
    // critical on one month of unverified figures.
    const severe = state === "loss" && monthlyGap > rev * 0.25;
    const gap = fmtAmount(monthlyGap);
    const concernStep = CONCERN_TEST_STEP[issue];
    return {
      status: "concluded",
      mainProblem: {
        code: state === "no_revenue_loss" ? "no_revenue_against_costs" : "costs_exceed_revenue",
        headline:
          state === "no_revenue_loss"
            ? `No revenue is coming in, while costs are ${fmtAmount(cost)} a month.`
            : `Costs are higher than revenue — the business is short about ${gap} a month.`,
        detail: "Based on one month of reported figures. What causes the gap isn't known yet.",
      },
      why: [
        state === "no_revenue_loss"
          ? { text: `Reported monthly costs of ${fmtAmount(cost)} and revenue of 0.`, provenance: "owner_input" }
          : { text: `Reported monthly costs of ${fmtAmount(cost)} against revenue of ${fmtAmount(rev)}.`, provenance: "owner_input" },
        ...(marginPct !== null ? [{ text: `Margin: ${fmtPct(marginPct)}.`, provenance: "calculated" as const }] : []),
        concernReason(issue),
      ],
      evidence,
      confidence: {
        dataCompleteness,
        evidenceStrength,
        certainty: {
          level: "medium",
          label: "Medium — one month of reported figures",
          explanation: "The shortfall is arithmetic on the revenue and costs entered, but one month may not be typical and the figures haven't been checked against records.",
        },
      },
      whatThisMeans: "If this month is typical, the business is covering the gap from cash or borrowing every month, and depends on reserves or new money until the gap closes.",
      firstStep: {
        title: "Find where the monthly gap comes from",
        why: "Break monthly costs into lines and compare revenue with previous months. That shows whether the gap comes from costs, from revenue, or both — which decides what to do.",
      },
      thenSteps: [
        { title: "Work out how many months of cash the business has at this rate", why: `Cash in the bank ÷ the monthly shortfall (${gap}) shows how much time there is to close the gap.` },
        ...(concernStep ? [concernStep] : []),
      ],
      doNotDoYet: [
        {
          title: "Don't add new fixed costs or spend more on growth yet",
          why:
            issue === "low_sales"
              ? "Until the breakdown shows where the gap comes from, new hires, leases or marketing add to a loss the business is already carrying. If the gap turns out to be a sales problem, growth spend can then be weighed on its own numbers."
              : "Until the breakdown shows where the gap comes from, new hires, leases or marketing add to a loss the business is already carrying.",
        },
      ],
      missingInformation: [
        { field: "Monthly costs broken down by line", why: "Shows which costs drive the gap." },
        { field: "Revenue and costs for each of the last 3–6 months", why: "Shows whether this month is typical or a one-off." },
        { field: "Cash in the bank today", why: "Shows how long the business can run at this rate." },
        ...customerMissing,
      ],
      canConclude: [
        state === "no_revenue_loss"
          ? `On the reported figures, no revenue came in against costs of ${fmtAmount(cost)} this month.`
          : `On the reported figures, costs exceed revenue by ${gap} this month.`,
      ],
      cannotConclude: [
        "Whether the gap comes from costs, from revenue, or both (no cost breakdown or revenue history entered).",
        "Whether this month is typical (one month entered).",
        "How long the business can continue (no cash balance entered).",
        ...(issue === "unclear" ? [] : [`Whether ${concernLabel} is a cause of the gap.`]),
      ],
      statedConcern: { mainIssue: issue, label: concernLabel, quote: statementQuote, status: "not_yet_tested" },
      dataWarnings,
      supporting: { severity: severe ? "critical" : "high", economics: state, monthlyGap, marginPct, revenuePerCustomer },
    };
  }

  // ── Covering costs (or breaking even): the stated concern can't be confirmed from one month ──
  if ((state === "profit" || state === "breakeven") && has(rev) && has(cost) && marginPct !== null) {
    const standing = state === "profit" ? "covers its costs" : "roughly breaks even";
    const byConcern = concernWhileCovering(issue, standing, marginPct);
    return {
      status: "insufficient_evidence",
      mainProblem: { code: "profitable_concern_unconfirmed", headline: "I can't determine that yet.", detail: byConcern.detail },
      why: [
        { text: `Reported monthly revenue of ${fmtAmount(rev)} and costs of ${fmtAmount(cost)}.`, provenance: "owner_input" },
        { text: `Margin: ${fmtPct(marginPct)}.`, provenance: "calculated" },
        ...(revenuePerCustomer !== null ? [{ text: `Monthly revenue per customer: ${fmtAmount(revenuePerCustomer)}.`, provenance: "calculated" as const }] : []),
        concernReason(issue),
      ],
      evidence,
      confidence: {
        dataCompleteness,
        evidenceStrength,
        certainty: { level: "cannot_determine", label: "Can't tell yet", explanation: byConcern.certainty },
      },
      whatThisMeans: byConcern.meaning,
      firstStep: byConcern.firstStep,
      thenSteps: [byConcern.then],
      doNotDoYet: [byConcern.doNotDoYet],
      missingInformation: [...concernMissing, ...customerMissing],
      canConclude: [`On the reported figures, the business ${standing} this month (margin ${fmtPct(marginPct)}).`],
      cannotConclude: [byConcern.cannot],
      statedConcern: { mainIssue: issue, label: concernLabel, quote: statementQuote, status: "not_yet_tested" },
      dataWarnings,
      supporting: { severity: null, economics: state, monthlyGap: null, marginPct, revenuePerCustomer },
    };
  }

  // ── Not enough evidence to conclude anything about the business's economics ──────────────────
  const can: string[] = [];
  const cannot: string[] = [];
  let detail: string;
  let code: MainProblemCode = "insufficient_evidence";
  if (state === "zero_activity") {
    code = "no_trading_activity_reported";
    detail = "Revenue and costs were both entered as 0, so there is no trading activity in these figures to diagnose.";
    can.push("No revenue and no costs were reported this month.");
    cannot.push("Anything about the business's economics — there is no activity in the figures.");
  } else if (state === "partial") {
    detail = `Only ${has(rev) ? "revenue" : "costs"} was entered, so it isn't possible to tell whether the business covers its costs.`;
    if (has(rev)) can.push(`Monthly revenue reported: ${fmtAmount(rev)}.`);
    if (has(cost)) can.push(`Monthly costs reported: ${fmtAmount(cost)}.`);
    cannot.push("Whether the business covers its costs.");
  } else {
    detail = issue === "unclear" ? "No figures and no specific concern were entered, so there is nothing yet to test." : `No figures were entered, so there is nothing yet to test ${concernLabel} against.`;
    cannot.push("Whether the business covers its costs.");
  }
  if (has(cust)) can.push(`Customers reported: ${cust.toLocaleString("en-US")}.`);
  can.push(issue === "unclear" ? "The problem as described (see Evidence)." : `The stated concern is ${concernLabel} (see Evidence for the description).`);
  cannot.push(issue === "unclear" ? "What the main problem is." : `Whether ${concernLabel} is the real problem.`);

  // A specific concern is tested by its own evidence first; with no concern ("not sure yet") the
  // basic figures come first. The next missing item follows as the "then" step.
  const ordered = issue === "unclear" ? [...figureMissing, ...concernMissing] : [...concernMissing, ...figureMissing];
  const [firstMissing, nextMissing] = ordered;
  const provide = (m: MissingInformation) => `Provide: ${m.field.charAt(0).toLowerCase()}${m.field.slice(1)}`;
  return {
    status: "insufficient_evidence",
    mainProblem: { code, headline: "I can't determine that yet.", detail },
    why: [
      concernReason(issue),
      ...(has(rev) ? [{ text: `Reported monthly revenue: ${fmtAmount(rev)}.`, provenance: "owner_input" as const }] : []),
      ...(has(cost) ? [{ text: `Reported monthly costs: ${fmtAmount(cost)}.`, provenance: "owner_input" as const }] : []),
      ...(has(cust) ? [{ text: `Reported customers: ${cust.toLocaleString("en-US")}.`, provenance: "owner_input" as const }] : []),
    ],
    evidence,
    confidence: {
      dataCompleteness,
      evidenceStrength,
      certainty: { level: "cannot_determine", label: "Can't tell yet", explanation: "There isn't enough evidence to name a main problem without guessing." },
    },
    whatThisMeans: "Any specific diagnosis now would be a guess. The next step is to collect the evidence below.",
    firstStep: { title: provide(firstMissing), why: firstMissing.why },
    thenSteps: [
      nextMissing
        ? { title: provide(nextMissing), why: nextMissing.why }
        : state === "zero_activity"
          ? { title: "Confirm whether the business traded this month", why: "Revenue and costs of 0 mean either no trading or figures not yet recorded — the diagnosis depends on which." }
          : { title: "Run the diagnosis again with that evidence", why: "The answer can only move past “can't determine” once the evidence above is entered." },
    ],
    doNotDoYet: [
      { title: "Don't make big spending, hiring or cost-cutting decisions on this diagnosis yet", why: "It doesn't yet rest on enough evidence to justify them." },
    ],
    missingInformation: ordered,
    canConclude: can,
    cannotConclude: cannot,
    statedConcern: { mainIssue: issue, label: concernLabel, quote: statementQuote, status: "not_yet_tested" },
    dataWarnings,
    supporting: { severity: null, economics: state, monthlyGap: null, marginPct, revenuePerCustomer },
  };
}

function concernWhileCovering(
  issue: GenericDiagnosisMainIssue,
  standing: "covers its costs" | "roughly breaks even",
  marginPct: number
): { detail: string; certainty: string; meaning: string; firstStep: Step; then: Step; doNotDoYet: Step; cannot: string } {
  const covering = `The business ${standing} this month (margin ${fmtPct(marginPct)})`;
  switch (issue) {
    case "low_sales":
      return {
        detail: `${covering}. Whether sales are falling needs more than one month of revenue.`,
        certainty: "One month of revenue can't show whether sales are falling.",
        meaning: `Sales may be lower than the business wants, but on these figures it ${standing}.`,
        firstStep: { title: "Compare monthly revenue for the last 6 months", why: "Shows whether sales are actually falling, flat or seasonal before anything is changed." },
        then: { title: "If revenue is falling, split it into number of customers × revenue per customer", why: "Shows whether fewer customers or smaller sales per customer drive the fall." },
        doNotDoYet: { title: "Don't cut prices or costs in a hurry", why: `The business ${standing}; a hasty cut could remove margin it doesn't need to lose.` },
        cannot: "Whether sales are falling (no revenue history entered).",
      };
    case "high_costs":
      return {
        detail: `${covering}. Whether costs are too high needs a breakdown, not just the total.`,
        certainty: "A single cost total can't show which costs are out of line.",
        meaning: `Costs may feel high, but on these figures the business ${standing}.`,
        firstStep: { title: "Break monthly costs into lines and compare each with last year", why: "Shows which costs have grown, so a cut can be targeted." },
        then: { title: "Get current quotes for the two largest cost lines", why: "Shows whether those costs are above what the business could pay today." },
        doNotDoYet: { title: "Don't cut costs across the board", why: "Without a breakdown a blanket cut can hit the costs that earn the revenue." },
        cannot: "Which costs are too high (no breakdown entered).",
      };
    case "cash_flow":
      return {
        detail: `${covering}. Cash can still run short in such a month — through payment timing, loan repayments, owner drawings, stock purchases or tax — and monthly totals don't show any of these.`,
        certainty: "Monthly revenue and cost totals don't show the cash balance or when money moves.",
        meaning: `On these figures the business ${standing}; if cash is still tight, the cause is somewhere these totals don't show.`,
        firstStep: { title: "List money in and out week by week, including loan repayments, drawings, stock and tax", why: "Shows exactly when cash runs short and what takes it." },
        then: { title: "Work out how many weeks the current bank balance covers", why: "Shows how urgent the cash problem is." },
        doNotDoYet: { title: "Don't take on new debt to cover the shortfall yet", why: "Find where the cash goes first; if it's timing, changing payment terms may cost less than borrowing." },
        cannot: "Why or when cash runs short (no cash balance or weekly cash movements entered).",
      };
    case "customer_retention":
      return {
        detail: `${covering}. Whether customers are coming back needs repeat-purchase data, which a single customer count can't show.`,
        certainty: "One customer count can't show whether customers return.",
        meaning: "Retention may be a concern, but the figures entered can't measure it.",
        firstStep: { title: "Count how many of last period's customers bought again this period", why: "The only direct measure of whether customers come back." },
        then: { title: "Ask a handful of customers who stopped buying why they stopped", why: "Turns a repeat-rate number into reasons that can be acted on." },
        doNotDoYet: { title: "Don't launch a loyalty scheme or discounts yet", why: "Measure repeat buying first, so it's clear whether retention is the problem." },
        cannot: "Whether customers are coming back (no repeat-purchase data entered).",
      };
    case "operations":
      return {
        detail: `${covering}. An operational problem has to be observed; nothing entered describes where work gets stuck.`,
        certainty: "No operational evidence (delays, backlogs, rework) was entered.",
        meaning: "Operations may be a concern, but no bottleneck can be named from what was entered.",
        firstStep: { title: "Record for two weeks where work gets stuck — what waits, for how long, how often", why: "Names the real bottleneck instead of guessing one." },
        then: { title: "Estimate what the biggest delay costs each week", why: "Shows whether fixing it is worth more than it would cost." },
        doNotDoYet: { title: "Don't buy new systems or hire to fix operations yet", why: "Find the bottleneck first, so the fix targets it." },
        cannot: "Where the operational bottleneck is (no operational evidence entered).",
      };
    case "unclear":
    default:
      return {
        detail: `${covering}. No specific problem stands out in the figures entered.`,
        certainty: "Nothing in the figures entered points to a specific problem.",
        meaning: `On these figures the business ${standing}; the question to answer is still open.`,
        firstStep: { title: "Write down what changed recently and what the business wants to be different", why: "Gives the diagnosis a specific question to answer." },
        then: { title: "Run the diagnosis again with that concern selected", why: "The concern decides which evidence to collect next." },
        doNotDoYet: { title: "Don't make big changes yet", why: "There is no evidence yet of what needs changing." },
        cannot: "What the main problem is (no specific concern or evidence entered).",
      };
  }
}
