/**
 * Startup validation planner — pure domain engine, no I/O.
 * Builds a ranked validation plan from hypotheses.
 * Chooses lowest-cost credible mechanism per hypothesis type.
 */

export type ExperimentMechanism =
  | "CUSTOMER_INTERVIEW"
  | "SUPPLIER_QUOTE"
  | "LANDING_PAGE"
  | "LETTER_OF_INTENT"
  | "CONCIERGE_TEST"
  | "PROTOTYPE"
  | "PRICE_TEST"
  | "PREORDER";

export interface HypothesisForPlanning {
  id: string;
  hypothesisType: string;  // DEMAND | PRICING | DELIVERY | ACQUISITION | ECONOMIC | REGULATORY | SUPPLIER
  statement: string;
  confidenceBefore: number;  // 0-100
  falsificationCriteria: string;
  requiresOwnerApproval: boolean;
  expectedCostCents: bigint | null;
  expectedDurationDays: number | null;
}

export interface PlannedExperiment {
  hypothesisId: string;
  mechanism: ExperimentMechanism;
  instructions: string;
  script: string;
  sampleSize: number;
  passCriteria: string;
  failCriteria: string;
  safetyLimitCents: bigint;
  stopConditions: string[];
  rollbackConditions: string[];
  requiresOwnerApproval: boolean;
  expectedCostCents: bigint;
  expectedDurationDays: number;
  priorityRank: number;
}

export interface ValidationPlanDraft {
  experiments: PlannedExperiment[];
  overallPassCriteria: string;
  overallFailCriteria: string;
  totalSpendingLimitCents: bigint;
  stopConditions: string[];
  safetyLimits: Record<string, unknown>;
}

/** Cost estimates per mechanism in cents (conservative defaults) */
const MECHANISM_COST_CENTS: Record<ExperimentMechanism, bigint> = {
  CUSTOMER_INTERVIEW: BigInt(0),
  SUPPLIER_QUOTE: BigInt(0),
  LETTER_OF_INTENT: BigInt(0),
  LANDING_PAGE: BigInt(20000),
  CONCIERGE_TEST: BigInt(50000),
  PRICE_TEST: BigInt(10000),
  PREORDER: BigInt(5000),
  PROTOTYPE: BigInt(200000),
};

const MECHANISM_DURATION_DAYS: Record<ExperimentMechanism, number> = {
  CUSTOMER_INTERVIEW: 14,
  SUPPLIER_QUOTE: 7,
  LETTER_OF_INTENT: 21,
  LANDING_PAGE: 30,
  CONCIERGE_TEST: 30,
  PRICE_TEST: 21,
  PREORDER: 30,
  PROTOTYPE: 60,
};

/** Choose lowest-cost credible mechanism per hypothesis type */
function chooseMechanism(hypothesisType: string): ExperimentMechanism {
  switch (hypothesisType) {
    case "DEMAND":      return "CUSTOMER_INTERVIEW";
    case "PRICING":     return "PRICE_TEST";
    case "DELIVERY":    return "CONCIERGE_TEST";
    case "ACQUISITION": return "LANDING_PAGE";
    case "ECONOMIC":    return "CUSTOMER_INTERVIEW";
    case "REGULATORY":  return "LETTER_OF_INTENT";
    case "SUPPLIER":    return "SUPPLIER_QUOTE";
    default:            return "CUSTOMER_INTERVIEW";
  }
}

function buildScript(hypothesisType: string, statement: string): string {
  const intro = "Introduction: Explain that you are researching a new business concept.";
  switch (hypothesisType) {
    case "DEMAND":
      return `${intro} Ask: "Do you currently face the problem described in: '${statement}'?" Record yes/no and context. Probe: "How do you solve it today? What would you pay for a solution?"`;
    case "PRICING":
      return `${intro} Present the offer at the test price. Record willingness to pay. Probe: "Is this price fair? What price would feel too expensive? Too cheap?"`;
    case "SUPPLIER":
      return `Request a formal quotation for the inputs required to test: '${statement}'. Ask for: unit price, minimum order, lead time, availability.`;
    case "REGULATORY":
      return `Contact the relevant authority. Ask: "What licences or permits are required for: '${statement}'? What is the timeline and cost?"`;
    default:
      return `Test the hypothesis: '${statement}'. Record observations against the falsification criteria.`;
  }
}

/** Priority: lower cost first, then higher certainty of falsification */
function priorityScore(mechanism: ExperimentMechanism, confidenceBefore: number): number {
  const cost = Number(MECHANISM_COST_CENTS[mechanism]);
  const maxCost = 200000;
  const costScore = 1 - (cost / maxCost);
  const uncertaintyScore = 1 - (confidenceBefore / 100);
  return costScore * 0.6 + uncertaintyScore * 0.4;
}

export function buildValidationPlan(hypotheses: HypothesisForPlanning[]): ValidationPlanDraft {
  if (hypotheses.length === 0) {
    return {
      experiments: [],
      overallPassCriteria: "No hypotheses to validate",
      overallFailCriteria: "No hypotheses to validate",
      totalSpendingLimitCents: BigInt(0),
      stopConditions: [],
      safetyLimits: {},
    };
  }

  const scored = hypotheses.map((h) => {
    const mechanism = chooseMechanism(h.hypothesisType);
    const score = priorityScore(mechanism, h.confidenceBefore);
    return { h, mechanism, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const experiments: PlannedExperiment[] = scored.map((item, idx) => {
    const { h, mechanism } = item;
    const costCents = h.expectedCostCents ?? MECHANISM_COST_CENTS[mechanism];
    const durationDays = h.expectedDurationDays ?? MECHANISM_DURATION_DAYS[mechanism];

    return {
      hypothesisId: h.id,
      mechanism,
      instructions: `Run a ${mechanism.replace(/_/g, " ").toLowerCase()} to test: ${h.statement}`,
      script: buildScript(h.hypothesisType, h.statement),
      sampleSize: mechanism === "CUSTOMER_INTERVIEW" ? 5 : 1,
      passCriteria: `Evidence confirms: ${h.statement}`,
      failCriteria: h.falsificationCriteria,
      safetyLimitCents: costCents * BigInt(2),
      stopConditions: [`Falsification criteria met: ${h.falsificationCriteria}`, "Safety limit reached"],
      rollbackConditions: ["Supplier withdraws", "Regulatory prohibition discovered", "Safety limit breached"],
      requiresOwnerApproval: h.requiresOwnerApproval,
      expectedCostCents: costCents,
      expectedDurationDays: durationDays,
      priorityRank: idx + 1,
    };
  });

  const totalSpendingLimitCents = experiments.reduce(
    (sum, e) => sum + e.safetyLimitCents,
    BigInt(0)
  );

  return {
    experiments,
    overallPassCriteria: `All critical hypotheses confirmed with sufficient evidence (${hypotheses.length} hypotheses)`,
    overallFailCriteria: `Any critical hypothesis falsified OR safety limit breached OR stop condition triggered`,
    totalSpendingLimitCents,
    stopConditions: [
      "Any hard gate failure detected",
      "Capital exhausted",
      "Owner instructs stop",
      "Critical hypothesis irrecoverably falsified",
    ],
    safetyLimits: {
      maxSpendPerExperiment: String(MECHANISM_COST_CENTS.PROTOTYPE * BigInt(2)),
      maxTotalSpend: String(totalSpendingLimitCents),
      noIrreversibleCommitments: true,
    },
  };
}

export function rankExperiments(experiments: PlannedExperiment[]): PlannedExperiment[] {
  return [...experiments].sort((a, b) => a.priorityRank - b.priorityRank);
}
