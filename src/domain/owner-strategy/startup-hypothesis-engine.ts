/**
 * Startup Hypothesis Generation and Prioritization Engine (Phase 5).
 * Pure functions — no I/O.
 */
import type {
  StartupHypothesisType,
  StartupHypothesisResult,
} from "./startup-lifecycle";

export interface HypothesisInput {
  ideaName: string;
  industry: string;
  targetCustomer: string | null;
  valuePropSummary: string | null;
  revenueModel: string | null;
  requiresLicence: boolean;
  estimatedCacCents: number | null;
  evidenceAvailable: string[];
}

export interface HypothesisDraft {
  statement: string;
  hypothesisType: StartupHypothesisType;
  evidenceCurrently: string | null;
  confidenceBefore: number; // 0-100
  falsificationCriteria: string;
  validationMethod: string;
  sampleThreshold: string;
  expectedCostCents: number;
  expectedDurationDays: number;
  requiresOwnerApproval: boolean;
  priorityScore: number; // DECISION_VALUE × UNCERTAINTY ÷ (COST × TIME)
}

export interface HypothesisEvaluation {
  hypothesisId: string;
  result: StartupHypothesisResult;
  confidenceAfter: number;
  effectOnScore: number; // positive = boosts idea score, negative = lowers
  followUpAction: string;
  interpretation: string;
}

// Hypothesis templates by type — parameterized at generation time
const HYPOTHESIS_TEMPLATES: Record<
  StartupHypothesisType,
  {
    statementTemplate: (idea: HypothesisInput) => string;
    falsificationCriteria: string;
    validationMethod: string;
    sampleThreshold: string;
    expectedCostCents: number;
    expectedDurationDays: number;
    requiresOwnerApproval: boolean;
    decisionValue: number; // 0-100
    requiresLicence?: boolean;
  }
> = {
  PROBLEM_EXISTENCE: {
    statementTemplate: (idea) =>
      `Customers in ${idea.targetCustomer ?? "the target segment"} experience the problem that ${idea.valuePropSummary ?? "the proposed solution"} addresses`,
    falsificationCriteria:
      "Fewer than 60% of interviewed participants confirm experiencing the problem regularly",
    validationMethod: "CUSTOMER_INTERVIEW",
    sampleThreshold: "Minimum 5 structured interviews with target customers",
    expectedCostCents: 0,
    expectedDurationDays: 14,
    requiresOwnerApproval: false,
    decisionValue: 95,
  },
  PROBLEM_SEVERITY: {
    statementTemplate: (idea) =>
      `The problem faced by ${idea.targetCustomer ?? "target customers"} is severe enough to motivate action`,
    falsificationCriteria:
      "Fewer than 50% of participants rate the problem as 7/10 or higher in severity",
    validationMethod: "CUSTOMER_INTERVIEW",
    sampleThreshold: "Minimum 5 structured interviews with severity rating",
    expectedCostCents: 0,
    expectedDurationDays: 14,
    requiresOwnerApproval: false,
    decisionValue: 90,
  },
  CUSTOMER_SEGMENT: {
    statementTemplate: (idea) =>
      `${idea.targetCustomer ?? "The target customer"} can be reliably identified, reached, and segmented`,
    falsificationCriteria:
      "Owner cannot identify at least 20 reachable customers within 30 days",
    validationMethod: "CUSTOMER_INTERVIEW",
    sampleThreshold: "Identify 20+ reachable prospects with shared characteristics",
    expectedCostCents: 0,
    expectedDurationDays: 10,
    requiresOwnerApproval: false,
    decisionValue: 85,
  },
  CUSTOMER_ACCESSIBILITY: {
    statementTemplate: (idea) =>
      `${idea.targetCustomer ?? "Target customers"} are accessible through at least one viable acquisition channel`,
    falsificationCriteria:
      "No channel produces qualified enquiries within 21 days at acceptable cost",
    validationMethod: "CHANNEL_TEST",
    sampleThreshold: "At least 1 verified acquisition channel with estimated CAC",
    expectedCostCents: 10000, // $100
    expectedDurationDays: 21,
    requiresOwnerApproval: true,
    decisionValue: 88,
  },
  WILLINGNESS_TO_PAY: {
    statementTemplate: (idea) =>
      `${idea.targetCustomer ?? "Target customers"} are willing to pay for ${idea.ideaName}`,
    falsificationCriteria:
      "Fewer than 30% of qualified prospects indicate purchase intent at the proposed price",
    validationMethod: "PRICE_TEST",
    sampleThreshold: "10+ qualified price conversations or one pre-order",
    expectedCostCents: 5000, // $50
    expectedDurationDays: 21,
    requiresOwnerApproval: true,
    decisionValue: 100,
  },
  SOLUTION_DESIRABILITY: {
    statementTemplate: (idea) =>
      `${idea.targetCustomer ?? "Target customers"} find ${idea.valuePropSummary ?? "the proposed solution"} preferable to current alternatives`,
    falsificationCriteria:
      "Fewer than 40% of participants rate solution as better than current alternative",
    validationMethod: "CONCIERGE",
    sampleThreshold: "Structured comparison with 5+ participants",
    expectedCostCents: 0,
    expectedDurationDays: 14,
    requiresOwnerApproval: false,
    decisionValue: 80,
  },
  SOLUTION_FEASIBILITY: {
    statementTemplate: (idea) =>
      `${idea.ideaName} can be delivered with available resources at the proposed quality level`,
    falsificationCriteria:
      "Delivery requires unavailable capabilities or costs exceed viable margin",
    validationMethod: "OPERATIONAL_SIMULATION",
    sampleThreshold: "Complete one end-to-end delivery trial",
    expectedCostCents: 20000, // $200
    expectedDurationDays: 7,
    requiresOwnerApproval: false,
    decisionValue: 85,
  },
  DELIVERY_FEASIBILITY: {
    statementTemplate: (idea) =>
      `${idea.ideaName} can be delivered consistently at scale without owner bottleneck`,
    falsificationCriteria:
      "Delivery requires owner's personal involvement for every unit, or error rate >10%",
    validationMethod: "OPERATIONAL_SIMULATION",
    sampleThreshold: "Run 3+ delivery cycles with documented outcomes",
    expectedCostCents: 30000,
    expectedDurationDays: 21,
    requiresOwnerApproval: false,
    decisionValue: 75,
  },
  ACQUISITION_FEASIBILITY: {
    statementTemplate: (idea) =>
      `Customers can be acquired for ${idea.ideaName} at a cost that supports a viable unit economics model`,
    falsificationCriteria:
      "CAC exceeds gross contribution per customer within 3 acquisition cycles",
    validationMethod: "CHANNEL_TEST",
    sampleThreshold: "Acquire at least 3 paying customers through one channel",
    expectedCostCents: 50000, // default; parameterized at generation time if estimatedCacCents available
    expectedDurationDays: 30,
    requiresOwnerApproval: true,
    decisionValue: 90,
  },
  UNIT_ECONOMICS: {
    statementTemplate: (idea) =>
      `${idea.ideaName} generates positive gross contribution per unit at the proposed price and cost structure`,
    falsificationCriteria:
      "Real unit cost exceeds price or gross margin falls below 20%",
    validationMethod: "UNIT_ECONOMICS_TEST",
    sampleThreshold: "Produce and deliver 5+ units with cost tracking",
    expectedCostCents: 50000,
    expectedDurationDays: 21,
    requiresOwnerApproval: false,
    decisionValue: 95,
  },
  RETENTION_POTENTIAL: {
    statementTemplate: (idea) =>
      `Customers who try ${idea.ideaName} will return for repeat purchase or referral`,
    falsificationCriteria:
      "No customer indicates intent to repurchase or refer after first interaction",
    validationMethod: "CONCIERGE",
    sampleThreshold: "Follow up with 5+ customers after first purchase",
    expectedCostCents: 0,
    expectedDurationDays: 45,
    requiresOwnerApproval: false,
    decisionValue: 70,
  },
  REGULATORY_VIABILITY: {
    statementTemplate: (idea) =>
      `${idea.ideaName} can operate legally without material regulatory barriers`,
    falsificationCriteria:
      "A mandatory licence or registration is unavailable or blocks launch within the planned timeline",
    validationMethod: "OWNER_ENTERED_EVIDENCE",
    sampleThreshold: "Written confirmation of applicable requirements from authoritative source",
    expectedCostCents: 10000,
    expectedDurationDays: 7,
    requiresOwnerApproval: false,
    decisionValue: 100,
  },
};

export function generateHypotheses(
  idea: HypothesisInput,
  includeRegulatory: boolean
): HypothesisDraft[] {
  const types: StartupHypothesisType[] = [
    "PROBLEM_EXISTENCE",
    "PROBLEM_SEVERITY",
    "CUSTOMER_SEGMENT",
    "CUSTOMER_ACCESSIBILITY",
    "WILLINGNESS_TO_PAY",
    "SOLUTION_DESIRABILITY",
    "SOLUTION_FEASIBILITY",
    "DELIVERY_FEASIBILITY",
    "ACQUISITION_FEASIBILITY",
    "UNIT_ECONOMICS",
    "RETENTION_POTENTIAL",
  ];

  if (includeRegulatory) {
    types.push("REGULATORY_VIABILITY");
  }

  return types.map((type) => {
    const template = HYPOTHESIS_TEMPLATES[type];
    const evidenceCurrently = idea.evidenceAvailable.length > 0
      ? `Available: ${idea.evidenceAvailable.slice(0, 3).join(", ")}`
      : null;

    // Confidence before: lower when no evidence available
    const confidenceBefore = evidenceCurrently ? 30 : 10;

    // Priority score = decisionValue × uncertainty ÷ (cost × time)
    const uncertainty = 100 - confidenceBefore;
    const normalizedCost = Math.max(1, template.expectedCostCents / 1000);
    const normalizedTime = Math.max(1, template.expectedDurationDays);
    const priorityScore =
      (template.decisionValue * uncertainty) / (normalizedCost * normalizedTime);

    // For ACQUISITION_FEASIBILITY, use the idea's CAC estimate if provided
    const expectedCostCents =
      type === "ACQUISITION_FEASIBILITY" && idea.estimatedCacCents
        ? idea.estimatedCacCents * 5
        : template.expectedCostCents;

    return {
      statement: template.statementTemplate(idea),
      hypothesisType: type,
      evidenceCurrently,
      confidenceBefore,
      falsificationCriteria: template.falsificationCriteria,
      validationMethod: template.validationMethod,
      sampleThreshold: template.sampleThreshold,
      expectedCostCents,
      expectedDurationDays: template.expectedDurationDays,
      requiresOwnerApproval: template.requiresOwnerApproval,
      priorityScore,
    };
  });
}

export function prioritizeHypotheses(
  hypotheses: HypothesisDraft[]
): HypothesisDraft[] {
  return [...hypotheses].sort((a, b) => b.priorityScore - a.priorityScore);
}

export function evaluateHypothesisResult(
  hypothesisType: StartupHypothesisType,
  result: StartupHypothesisResult,
  confidenceBefore: number
): HypothesisEvaluation {
  let confidenceAfter: number;
  let effectOnScore: number;
  let followUpAction: string;
  let interpretation: string;

  switch (result) {
    case "CONFIRMED":
      confidenceAfter = Math.min(90, confidenceBefore + 50);
      effectOnScore = 15;
      interpretation = `Hypothesis confirmed. Evidence supports advancing.`;
      followUpAction = "Mark as confirmed, update readiness assessment, advance to next hypothesis";
      break;
    case "WEAKENED":
      confidenceAfter = Math.max(10, confidenceBefore - 20);
      effectOnScore = -10;
      interpretation = "Partial evidence — hypothesis weakened but not falsified.";
      followUpAction = "Gather additional evidence before advancing; reduce confidence weight in readiness";
      break;
    case "REJECTED":
      confidenceAfter = 5;
      effectOnScore = -40;
      interpretation = "Hypothesis falsified. This is a material finding against the idea.";
      followUpAction = buildRejectedFollowUp(hypothesisType);
      break;
    case "INCONCLUSIVE":
      confidenceAfter = confidenceBefore;
      effectOnScore = -5;
      interpretation = "Evidence inconclusive. Cannot advance or reject based on current data.";
      followUpAction = "Re-run experiment with larger sample or alternative method";
      break;
    case "PENDING":
      confidenceAfter = confidenceBefore;
      effectOnScore = 0;
      interpretation = "Pending — no result recorded yet";
      followUpAction = "Run validation experiment";
      break;
  }

  return {
    hypothesisId: "", // filled by caller
    result,
    confidenceAfter,
    effectOnScore,
    followUpAction,
    interpretation,
  };
}

function buildRejectedFollowUp(type: StartupHypothesisType): string {
  const actions: Record<StartupHypothesisType, string> = {
    PROBLEM_EXISTENCE:
      "Problem not confirmed — reconsider idea or pivot to a problem with observed evidence",
    PROBLEM_SEVERITY:
      "Problem exists but is not severe enough to motivate payment — explore adjacent problems",
    CUSTOMER_SEGMENT:
      "Segment is not reachable or identifiable — redefine target customer or reject idea",
    CUSTOMER_ACCESSIBILITY:
      "No viable acquisition channel found — hold idea until a channel is identified",
    WILLINGNESS_TO_PAY:
      "No willingness to pay at proposed price — lower price or reposition; consider rejection",
    SOLUTION_DESIRABILITY:
      "Solution not preferred — redesign product or reconsider idea",
    SOLUTION_FEASIBILITY:
      "Solution cannot be delivered within resource constraints — MODIFY or REJECT",
    DELIVERY_FEASIBILITY:
      "Consistent delivery not achievable — hold until operational model is resolved",
    ACQUISITION_FEASIBILITY:
      "CAC too high — idea not viable unless acquisition cost is materially reduced",
    UNIT_ECONOMICS:
      "Unit economics negative — business model does not work; REJECT or fundamentally restructure",
    RETENTION_POTENTIAL:
      "No retention signal — single-purchase model only; reassess revenue model",
    REGULATORY_VIABILITY:
      "Regulatory blocker identified — do not advance until licence or compliance pathway is confirmed",
  };
  return actions[type];
}
