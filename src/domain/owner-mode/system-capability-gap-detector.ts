/**
 * OpsIQ Capability Gap Detector / System Feature Recommendation Engine (depth pass).
 *
 * Scans the gap-producing observations OpsIQ has already surfaced elsewhere — decisions it cannot safely
 * automate (from the approval policy), missing operational data (from corrections/findings), manual owner
 * burden it cannot yet remove, low-confidence signals, and absent integrations — and turns them into
 * governed **system feature recommendations**: what OpsIQ itself would have to build to close each gap. It is
 * pure + deterministic. It never builds anything (status is always `RECOMMENDED`), never fabricates a money
 * figure or an effort estimate beyond a fixed per-capability complexity band, and always states what remains
 * owner-controlled even after the capability exists (a new capability never removes human control of a
 * material money/staff/legal/reputation decision).
 *
 * Governance stance (matches OpsIQ rules):
 * - A capability is recommended, never auto-adopted; high-risk decisions stay owner-controlled regardless.
 * - Evidence is real refs the caller counted; nothing is invented.
 * - No fraud/negligence/firing/payroll/discipline language; no hidden staff score; no fabricated money.
 */

export type MissingCapabilityType =
  | "VERIFIED_FINANCIAL_LEDGER"
  | "REFUND_RECONCILIATION"
  | "MARGIN_SIMULATION"
  | "SPEND_CONTROL_LEDGER"
  | "COMPENSATION_INTEGRATION"
  | "CONTRACT_TERMS_REGISTRY"
  | "LEGAL_REVIEW_WORKFLOW"
  | "IDENTITY_EVIDENCE_CHAIN"
  | "AUTOMATED_PROOF_CAPTURE"
  | "REAL_TIME_KPI_FEED"
  | "SUPPLIER_INVENTORY_INTEGRATION"
  | "CUSTOMER_FEEDBACK_INTAKE"
  | "AUTOMATED_ROLLBACK"
  | "DEMAND_VALIDATION";

/** Where a gap observation came from. */
export type CapabilityGapSignalType =
  | "UNAUTOMATABLE_DECISION"
  | "MISSING_OPERATIONAL_DATA"
  | "MANUAL_OWNER_BURDEN"
  | "LOW_CONFIDENCE_SIGNAL"
  | "ABSENT_INTEGRATION"
  | "UNVERIFIABLE_CLAIM";

export type GapSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type GapConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type CapabilityComplexity = "LOW" | "MEDIUM" | "HIGH";

/** One gap-producing observation, already tagged with the capability it implies. */
export interface CapabilityGapSignal {
  signalType: CapabilityGapSignalType;
  missingCapability: MissingCapabilityType;
  detail: string;
  severity: GapSeverity;
  evidenceRefs: string[];
  /** The action type this gap currently blocks OpsIQ from safely automating, if any. */
  blocksAutomationOf: string | null;
  /** Concrete missing data this gap depends on, if the gap is a data gap. */
  missingData: string[];
}

export interface CapabilityGapInput {
  signals: CapabilityGapSignal[];
  dataConfidence: GapConfidence | null;
}

/** The 21-field system feature recommendation. */
export interface SystemCapabilityRecommendation {
  workspaceId: string; // 1
  capabilityType: MissingCapabilityType; // 2
  title: string; // 3
  severity: GapSeverity; // 4
  confidence: GapConfidence; // 5
  problemStatement: string; // 6 — what OpsIQ cannot do today
  recommendedCapability: string; // 7 — the feature to build
  ownerBenefit: string; // 8 — why it matters to the owner
  unlocksAutomation: boolean; // 9 — would it let OpsIQ safely automate something
  unlockedActionTypes: string[]; // 10 — which actions it would unlock
  governanceGuardrail: string; // 11 — what stays human even after
  signalCount: number; // 12 — how many observations point to it
  supportingSignalTypes: string[]; // 13
  evidenceRefs: string[]; // 14
  blocksToday: string[]; // 15 — what is currently blocked / manual
  dependsOnData: boolean; // 16
  missingData: string[]; // 17
  estimatedComplexity: CapabilityComplexity; // 18 — fixed per-capability band, never fabricated
  priorityRank: number; // 19 — 1 = build first
  status: "RECOMMENDED"; // 20 — never auto-built
  evaluatedAt: string; // 21
}

export interface CapabilityGapSummary {
  total: number;
  critical: number;
  high: number;
  unlocksAutomation: number;
}

export interface CapabilityGapAnalysis {
  workspaceId: string;
  recommendations: SystemCapabilityRecommendation[];
  topRecommendation: SystemCapabilityRecommendation | null;
  summary: CapabilityGapSummary;
  evaluatedAt: string;
}

interface CapabilityTemplate {
  title: string;
  problem: string;
  capability: string;
  benefit: string;
  guardrail: string;
  complexity: CapabilityComplexity;
  unlocks: boolean;
}

const GUARD_MATERIAL =
  "Even once built, material money/staff/legal/reputation decisions stay owner-controlled — the capability informs the decision, it never makes it.";
const GUARD_ASSIST =
  "This capability only assists OpsIQ's existing recommendations; it changes no money, staff, or legal state on its own.";

const CAPABILITY_TEMPLATES: Record<MissingCapabilityType, CapabilityTemplate> = {
  VERIFIED_FINANCIAL_LEDGER: {
    title: "Verified financial ledger", problem: "OpsIQ cannot verify revenue, cost, or cash figures against a reconciled source of truth.",
    capability: "A verified financial ledger that reconciles recorded figures against confirmed transactions.",
    benefit: "Trustworthy cash and margin numbers the owner can rely on for decisions.", guardrail: GUARD_MATERIAL, complexity: "HIGH", unlocks: true,
  },
  REFUND_RECONCILIATION: {
    title: "Refund reconciliation", problem: "OpsIQ cannot tie a refund back to a confirmed original charge.",
    capability: "A refund-reconciliation capability linking each refund to its verified original transaction.",
    benefit: "Refund decisions backed by a real record instead of a manual owner check.", guardrail: GUARD_MATERIAL, complexity: "MEDIUM", unlocks: true,
  },
  MARGIN_SIMULATION: {
    title: "Margin simulation", problem: "OpsIQ cannot show the profit impact of a price or discount change before it is made.",
    capability: "A margin-simulation capability that projects the profit effect of a pricing/discount change.",
    benefit: "The owner sees the margin effect before committing to a price change.", guardrail: GUARD_MATERIAL, complexity: "MEDIUM", unlocks: true,
  },
  SPEND_CONTROL_LEDGER: {
    title: "Spend-control ledger", problem: "OpsIQ has no budget/available-funds view to flag an over-budget commitment.",
    capability: "A spend-control ledger tracking budget and available funds against committed spend.",
    benefit: "Over-budget spend is caught before it happens.", guardrail: GUARD_MATERIAL, complexity: "MEDIUM", unlocks: true,
  },
  COMPENSATION_INTEGRATION: {
    title: "Read-only compensation feed", problem: "OpsIQ has no view of staff compensation and must never change it.",
    capability: "A read-only compensation feed that surfaces anomalies without ever changing what anyone is paid.",
    benefit: "Compensation anomalies are visible to the owner without OpsIQ ever touching pay.", guardrail: GUARD_MATERIAL, complexity: "MEDIUM", unlocks: false,
  },
  CONTRACT_TERMS_REGISTRY: {
    title: "Contract-terms registry", problem: "OpsIQ has no record of agreed contract terms to check a proposed change against.",
    capability: "A contract-terms registry storing agreed terms so a proposed change can be checked against them.",
    benefit: "Contract changes are checked against what was actually agreed.", guardrail: GUARD_MATERIAL, complexity: "MEDIUM", unlocks: false,
  },
  LEGAL_REVIEW_WORKFLOW: {
    title: "Legal-review workflow", problem: "OpsIQ has no workflow to route a legal matter to a qualified human.",
    capability: "A legal-review workflow that routes a draft to a qualified reviewer and tracks the outcome.",
    benefit: "Legal matters are tracked and routed instead of stalling on the owner.", guardrail: GUARD_MATERIAL, complexity: "MEDIUM", unlocks: false,
  },
  IDENTITY_EVIDENCE_CHAIN: {
    title: "Identity / evidence chain", problem: "OpsIQ cannot establish a verified evidence chain and must never accuse anyone.",
    capability: "An evidence-chain capability that records a neutral, verifiable trail for the owner to review in person.",
    benefit: "The owner reviews a neutral, verifiable pattern rather than an accusation.", guardrail: GUARD_MATERIAL, complexity: "HIGH", unlocks: false,
  },
  AUTOMATED_PROOF_CAPTURE: {
    title: "Automated proof capture", problem: "Proof quality depends on manual submission that keeps failing review.",
    capability: "An automated proof-capture capability that records job-specific proof at the point of work.",
    benefit: "Fewer weak-proof reviews reaching the owner.", guardrail: GUARD_ASSIST, complexity: "MEDIUM", unlocks: true,
  },
  REAL_TIME_KPI_FEED: {
    title: "Real-time KPI feed", problem: "OpsIQ relies on periodic snapshots and cannot see KPI deterioration as it happens.",
    capability: "A real-time KPI feed that surfaces deterioration between snapshots.",
    benefit: "Problems are caught earlier instead of at the next review.", guardrail: GUARD_ASSIST, complexity: "HIGH", unlocks: false,
  },
  SUPPLIER_INVENTORY_INTEGRATION: {
    title: "Supplier / inventory integration", problem: "OpsIQ has no live view of supplier or inventory state.",
    capability: "A supplier/inventory integration that surfaces stock and supplier risk in real time.",
    benefit: "Inventory and supplier risk is visible before it disrupts operations.", guardrail: GUARD_ASSIST, complexity: "HIGH", unlocks: false,
  },
  CUSTOMER_FEEDBACK_INTAKE: {
    title: "Structured customer-feedback intake", problem: "Complaint/rework data arrives ad hoc, weakening the process signal.",
    capability: "A structured customer-feedback intake that captures complaints/rework consistently.",
    benefit: "A sharper process signal from consistent complaint/rework data.", guardrail: GUARD_ASSIST, complexity: "LOW", unlocks: false,
  },
  AUTOMATED_ROLLBACK: {
    title: "Automated rollback", problem: "OpsIQ cannot safely undo an automated action, so it keeps more actions manual.",
    capability: "An automated-rollback capability that can reverse a safe action if it goes wrong.",
    benefit: "More routine actions can be safely automated with a reliable undo.", guardrail: GUARD_ASSIST, complexity: "MEDIUM", unlocks: true,
  },
  DEMAND_VALIDATION: {
    title: "Demand validation", problem: "OpsIQ cannot validate demand before recommending scaling.",
    capability: "A demand-validation capability that tests real demand before any scaling recommendation.",
    benefit: "Scaling is grounded in validated demand, not assumption.", guardrail: GUARD_MATERIAL, complexity: "MEDIUM", unlocks: false,
  },
};

const SEVERITY_RANK: Record<GapSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function maxSeverity(a: GapSeverity, b: GapSeverity): GapSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

/**
 * Build the system feature recommendations. Pure + deterministic. Groups signals by the capability they
 * imply, aggregates severity/evidence/unlocked actions, ranks most-severe (then most-supported) first.
 */
export function buildCapabilityGapDetector(
  input: CapabilityGapInput,
  workspaceId: string,
  evaluatedAt: string,
): CapabilityGapAnalysis {
  const byCapability = new Map<MissingCapabilityType, CapabilityGapSignal[]>();
  for (const s of input.signals) {
    const list = byCapability.get(s.missingCapability) ?? [];
    list.push(s);
    byCapability.set(s.missingCapability, list);
  }

  const confidence: GapConfidence = input.dataConfidence ?? "MEDIUM";
  const recommendations: SystemCapabilityRecommendation[] = [];

  for (const [capabilityType, signals] of byCapability) {
    const tpl = CAPABILITY_TEMPLATES[capabilityType];
    const severity = signals.map((s) => s.severity).reduce(maxSeverity, "LOW" as GapSeverity);
    const evidenceRefs = Array.from(new Set(signals.flatMap((s) => s.evidenceRefs)));
    const unlockedActionTypes = Array.from(new Set(signals.map((s) => s.blocksAutomationOf).filter((a): a is string => a !== null)));
    const supportingSignalTypes = Array.from(new Set(signals.map((s) => s.signalType)));
    const blocksToday = Array.from(new Set(signals.map((s) => s.detail)));
    const missingData = Array.from(new Set(signals.flatMap((s) => s.missingData)));
    recommendations.push({
      workspaceId,
      capabilityType,
      title: tpl.title,
      severity,
      confidence,
      problemStatement: tpl.problem,
      recommendedCapability: tpl.capability,
      ownerBenefit: tpl.benefit,
      unlocksAutomation: tpl.unlocks && unlockedActionTypes.length > 0,
      unlockedActionTypes,
      governanceGuardrail: tpl.guardrail,
      signalCount: signals.length,
      supportingSignalTypes,
      evidenceRefs,
      blocksToday,
      dependsOnData: missingData.length > 0,
      missingData,
      estimatedComplexity: tpl.complexity,
      priorityRank: 0, // assigned after sort
      status: "RECOMMENDED",
      evaluatedAt,
    });
  }

  // Most-severe first; break ties by more supporting signals, then stable by capability name.
  recommendations.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.signalCount - a.signalCount ||
    a.capabilityType.localeCompare(b.capabilityType),
  );
  recommendations.forEach((r, i) => { r.priorityRank = i + 1; });

  const summary: CapabilityGapSummary = {
    total: recommendations.length,
    critical: recommendations.filter((r) => r.severity === "CRITICAL").length,
    high: recommendations.filter((r) => r.severity === "HIGH").length,
    unlocksAutomation: recommendations.filter((r) => r.unlocksAutomation).length,
  };

  return { workspaceId, recommendations, topRecommendation: recommendations[0] ?? null, summary, evaluatedAt };
}
