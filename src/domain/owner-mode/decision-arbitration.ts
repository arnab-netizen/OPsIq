/**
 * Jarvis 360 Slice 10 — decision arbitration (pure).
 *
 * Audit finding: conflicting recommendations were not arbitrated at runtime, and
 * urgency/reversibility/survival-first were absent. This thin layer takes candidate
 * recommendations annotated with their gate outcomes + risk signals and returns one
 * recommended decision plus rejected/blocked/deferred alternatives with reasons,
 * the dominant constraint, and reconsideration conditions. It COMPLEMENTS the
 * existing best-path-selector (which ranks by expected value) — it does not replace
 * it; safety constraints simply dominate value. No DB/I-O.
 */

export type GateConstraint =
  | "legal_security"
  | "proof"
  | "cash"
  | "margin"
  | "data"
  | "capacity"
  | "quality_reputation";

/** Hard blocks in priority order — the first present is the dominant constraint. */
const CONSTRAINT_PRIORITY: GateConstraint[] = [
  "legal_security",
  "proof",
  "cash",
  "margin",
  "data",
  "capacity",
  "quality_reputation",
];

const RECONSIDER: Record<GateConstraint, string> = {
  legal_security: "after legal/security clearance",
  proof: "once required proof is cleared",
  cash: "once cash returns to a safe state",
  margin: "once gross margin clears the floor",
  data: "once the missing/stale data is provided",
  capacity: "once the capacity bottleneck is cleared",
  quality_reputation: "once quality/reputation is stable",
};

export interface ArbitrationCandidate {
  id: string;
  /** The set of hard constraints currently blocking this candidate (if any). */
  blockedBy: GateConstraint[];
  /** 0..1 — risk of taking the action. */
  riskOfAction: number;
  /** 0..1 — risk of NOT acting (urgency). */
  riskOfInaction: number;
  /** 0..1 — confidence. */
  confidence: number;
  /** Aligns with a stated owner goal (tie-breaker). */
  ownerGoalAligned: boolean;
  /** Reversible decisions are preferred under uncertainty. */
  reversible: boolean;
}

export type ArbitrationVerdict = "recommended" | "rejected" | "blocked" | "deferred";

export interface ArbitratedDecision {
  id: string;
  verdict: ArbitrationVerdict;
  reasons: string[];
  dominantConstraint: GateConstraint | null;
  reconsiderWhen: string | null;
  ownerApprovalRequired: boolean;
}

export interface ArbitrationResult {
  recommended: ArbitratedDecision | null;
  decisions: ArbitratedDecision[];
}

function dominant(blockedBy: GateConstraint[]): GateConstraint | null {
  for (const c of CONSTRAINT_PRIORITY) if (blockedBy.includes(c)) return c;
  return null;
}

/**
 * Arbitrate candidates. Any candidate with a hard block is blocked/deferred (deferred
 * when its inaction risk is high enough to revisit). The remaining candidates are
 * ranked: owner-goal alignment → lower action risk → higher confidence → reversibility
 * → higher urgency. The top survivor is recommended.
 */
export function arbitrate(candidates: ArbitrationCandidate[]): ArbitrationResult {
  const decisions: ArbitratedDecision[] = [];
  const viable: ArbitrationCandidate[] = [];

  for (const c of candidates) {
    const dc = dominant(c.blockedBy);
    if (dc) {
      const deferred = c.riskOfInaction >= 0.7; // urgent → revisit when unblocked
      decisions.push({
        id: c.id,
        verdict: deferred ? "deferred" : "blocked",
        reasons: [`Blocked by ${dc.replace(/_/g, "/")} constraint.`],
        dominantConstraint: dc,
        reconsiderWhen: RECONSIDER[dc],
        ownerApprovalRequired: dc === "legal_security",
      });
    } else {
      viable.push(c);
    }
  }

  viable.sort((a, b) => {
    if (a.ownerGoalAligned !== b.ownerGoalAligned) return a.ownerGoalAligned ? -1 : 1;
    if (a.riskOfAction !== b.riskOfAction) return a.riskOfAction - b.riskOfAction;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    if (a.reversible !== b.reversible) return a.reversible ? -1 : 1;
    return b.riskOfInaction - a.riskOfInaction;
  });

  viable.forEach((c, idx) => {
    decisions.push({
      id: c.id,
      verdict: idx === 0 ? "recommended" : "rejected",
      reasons:
        idx === 0
          ? ["Highest-priority safe option (goal-aligned, lower action risk, higher confidence)."]
          : ["A higher-priority safe option dominates this one."],
      dominantConstraint: null,
      reconsiderWhen: idx === 0 ? null : "if the recommended option fails or conditions change",
      ownerApprovalRequired: c.riskOfAction >= 0.7 || !c.reversible,
    });
  });

  const recommended = decisions.find((d) => d.verdict === "recommended") ?? null;
  return { recommended, decisions };
}
