import { describe, it, expect } from "vitest";
import {
  assessSafety,
  EVIDENCE_SUPPORT_CONFIDENCE_FLOOR,
  type EvidenceSupportSignal,
  type CausalChallengeGateSignal,
  type ConstraintAlignmentGateSignal,
  type OwnerActionDangerGateSignal,
} from "@/services/governance/abstention-engine";

/**
 * Evidence-support rule REFINEMENT. A low support ratio with unresolved gaps abstains
 * ONLY when the committed diagnosis confidence is below the MODERATE sufficiency floor.
 * A confident (MODERATE+) committed diagnosis resting on its critical trigger evidence
 * is no longer abstained merely for citing a minority of (decoy/downstream) evidence
 * ids. Genuine danger is still caught by the confidence floor (<0.3) and the causal-
 * challenge / owner-action-danger / constraint-alignment rules. Pure assessSafety unit.
 */

const HIGH = 0.8;
const MODERATE = EVIDENCE_SUPPORT_CONFIDENCE_FLOOR; // 0.55
const PROVISIONAL = 0.35;

const lowSupport: EvidenceSupportSignal = { committed: true, supportRatio: 0.25, hasMissingEvidence: true };
const noCausal: CausalChallengeGateSignal = { committed: true, challenged: false, reasons: [], abstention_hint: null };
const noConstraint: ConstraintAlignmentGateSignal = { committed: true, conflict: false, reasons: [] };
const noOwnerDanger: OwnerActionDangerGateSignal = { danger: false, type: null, reasons: [] };

// assessSafety(confidence, has_evidence, contradictions, scope_valid, preconditions_met,
//   irreversibility, operator_capacity, active_conflicts, evidence_support,
//   causal_challenge, constraint_alignment, owner_action_danger)
function assess(
  confidence: number,
  opts: {
    support?: EvidenceSupportSignal;
    causal?: CausalChallengeGateSignal;
    constraint?: ConstraintAlignmentGateSignal;
    owner?: OwnerActionDangerGateSignal;
  } = {}
) {
  return assessSafety(
    confidence,
    true,
    0,
    true,
    true,
    0,
    true,
    0,
    opts.support ?? lowSupport,
    opts.causal ?? noCausal,
    opts.constraint ?? noConstraint,
    opts.owner ?? noOwnerDanger
  );
}

describe("evidence-support refinement — release when confident & clean", () => {
  it("MODERATE-confidence committed diagnosis with low support + gaps does NOT abstain (FRC-02 class)", () => {
    const r = assess(MODERATE);
    expect(r.abstain).toBe(false);
  });

  it("HIGH-confidence committed diagnosis with low support + gaps does NOT abstain (FRC-03/FRC-12 class)", () => {
    const r = assess(HIGH);
    expect(r.abstain).toBe(false);
  });
});

describe("evidence-support refinement — still abstain when not clean", () => {
  it("low support + WEAK (PROVISIONAL) confidence still abstains", () => {
    const r = assess(PROVISIONAL);
    expect(r.abstain).toBe(true);
    expect(r.abstention_state).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.unsafe_conditions.some((c) => c.condition_type === "MISSING_EVIDENCE" && c.blocking)).toBe(true);
  });

  it("low support + sufficient confidence + a contradiction (causal challenge) still abstains", () => {
    const r = assess(HIGH, {
      causal: { committed: true, challenged: true, reasons: ["adverse off-archetype"], abstention_hint: "CONFLICTING_SIGNALS" },
    });
    expect(r.abstain).toBe(true);
  });

  it("low support + sufficient confidence + a protected owner-action danger still abstains", () => {
    const r = assess(HIGH, {
      owner: { danger: true, type: "NEGATIVE_MARGIN_DISCOUNT", reasons: ["deep discount on negative contribution"] },
    });
    expect(r.abstain).toBe(true);
  });

  it("low support + sufficient confidence + a constraint conflict still abstains", () => {
    const r = assess(HIGH, {
      constraint: { committed: true, conflict: true, reasons: ["infeasible under owner constraints"] },
    });
    expect(r.abstain).toBe(true);
  });

  it("below the hard confidence floor (<0.3) still abstains regardless of the refinement", () => {
    const r = assess(0.1);
    expect(r.abstain).toBe(true);
  });

  it("high support ratio never triggers the evidence-support rule (control)", () => {
    const r = assess(HIGH, { support: { committed: true, supportRatio: 0.75, hasMissingEvidence: true } });
    expect(r.abstain).toBe(false);
  });

  it("committed diagnosis with low support but NO declared gaps does not abstain (control)", () => {
    const r = assess(MODERATE, { support: { committed: true, supportRatio: 0.25, hasMissingEvidence: false } });
    expect(r.abstain).toBe(false);
  });
});
