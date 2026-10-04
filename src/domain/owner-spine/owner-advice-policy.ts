/**
 * Owner Intelligence Spine — the ONE advice policy (pure, deterministic, no I/O, no persistence).
 *
 * Confidence in OpsIQ is a bounded HEURISTIC OF EVIDENCE STRENGTH. It is not a probability, it is not calibrated, and
 * this policy introduces no new score, formula or threshold. It answers a different question from "which candidate
 * wins" (that is the canonical comparator in owner-decision.ts, unchanged): given the ELECTED target and the evidence
 * behind it, WHAT MAY OPSIQ CLAIM OR RECOMMEND?
 *
 * Every owner surface (Home, Cockpit, Priorities, Command Center, Control Center, domain main-target blocks) reads the
 * result from `CurrentOwnerDecision.advicePolicy`; none may invent its own "act / do not act" semantics.
 *
 * ─── Advice modes ──────────────────────────────────────────────────────────────────────────────────────────────────
 *   SUPPORTED                      current, sufficient evidence for this kind of claim: state it normally.
 *   CAUTION                        shown, but material uncertainty remains: name it, give a reassessment condition.
 *   PROVISIONAL                    a real issue needs attention, but the diagnosis/score for it rests on incomplete or
 *                                  in-progress evidence: never present magnitude, diagnosis or outcome as established.
 *   REFRESH_REQUIRED               the evidence is out of date: the target is to update/reconfirm it; the old diagnosis
 *                                  is never stated as a current fact.
 *   EVIDENCE_REQUIRED              critical information is missing: OpsIQ abstains from the material recommendation
 *                                  and asks for the named evidence (abstention is NOT "show nothing").
 *   RECORDED_FACT                  a recorded compliance/risk/safety fact: actionable as a FACT; unrelated missing
 *                                  diagnostic data does not make it uncertain.
 *   CONFLICT_REQUIRES_RESOLUTION   authoritative sources disagree and recency cannot settle it: never averaged, never
 *                                  silently resolved; the owner is told what conflicts and what resolves it.
 *
 * ─── Claim types (the evidence standard differs) ───────────────────────────────────────────────────────────────────
 *   RECORDED_FACT                  the record itself.
 *   CURRENT_MEASURED_CONDITION     valid, current underlying data.
 *   INFERRED_DIAGNOSIS             relevant inputs + a deterministic rule.
 *   RECOMMENDATION                 a supporting diagnosis + applicability.
 *   FORECAST_OR_PLAN               highest restraint: never stronger than CAUTION, never a commitment on heuristic strength.
 *
 * Invariants (tested): missing evidence is never read as "resolved" or "no danger"; stale evidence is never current
 * truth; a recorded fact is never softened by unrelated data gaps; a low-confidence reading never erases severity;
 * every mode other than SUPPORTED carries a concrete next evidence action (no dead end).
 */
import type { OwnerCandidateSource, OwnerPriorityClass } from "./owner-decision";
import type { OwnerTargetIntent } from "./owner-imperatives";

export const OWNER_ADVICE_POLICY_VERSION = "owner-advice-policy-v1" as const;

export const OWNER_ADVICE_MODES = [
  "SUPPORTED",
  "CAUTION",
  "PROVISIONAL",
  "REFRESH_REQUIRED",
  "EVIDENCE_REQUIRED",
  "RECORDED_FACT",
  "CONFLICT_REQUIRES_RESOLUTION",
] as const;
export type OwnerAdviceMode = (typeof OWNER_ADVICE_MODES)[number];

export const OWNER_CLAIM_TYPES = [
  "RECORDED_FACT",
  "CURRENT_MEASURED_CONDITION",
  "INFERRED_DIAGNOSIS",
  "RECOMMENDATION",
  "FORECAST_OR_PLAN",
] as const;
export type OwnerClaimType = (typeof OWNER_CLAIM_TYPES)[number];

/** How the evidence for the TARGET itself compares with business-wide data sufficiency. */
export type OwnerTargetEvidence =
  /** The target's own area is not flagged incomplete (any business-wide shortfall is elsewhere). */
  | "TARGET_AREA_SUFFICIENT"
  /** The target's own area is flagged incomplete, or the target itself reports missing data. */
  | "TARGET_AREA_INCOMPLETE"
  /** A recorded control fact: independent of diagnostic data completeness. */
  | "RECORDED_FACT"
  /** No target (or a request for evidence): not applicable. */
  | "NOT_APPLICABLE";

export interface OwnerAdvicePolicy {
  contractVersion: typeof OWNER_ADVICE_POLICY_VERSION;
  mode: OwnerAdviceMode;
  /** The kind of claim the elected target makes; null when there is no target. */
  claimType: OwnerClaimType | null;
  /** The elected step (including a refresh or an evidence request) can be carried out now as stated. */
  canAct: boolean;
  /** Money, capacity or a plan may be committed on this evidence (never true for a refresh, request, conflict or provisional). */
  canMakeMaterialCommitment: boolean;
  requiresEvidenceRefresh: boolean;
  targetEvidence: OwnerTargetEvidence;
  /** Plain-language qualifier for the claim ("we know" / "the figures indicate" / "incomplete" / "out of date" / "cannot support yet"). */
  ownerStatement: string;
  /** Why this mode was chosen (composes existing decision facts; never a parallel truth). */
  reasons: string[];
  /** What the owner must supply or confirm (composed from the decision's missingInformation). */
  missingEvidence: string[];
  /** The concrete next step to resolve the uncertainty. Empty only for SUPPORTED and RECORDED_FACT without a gap. */
  nextEvidenceAction: string;
  /** When OpsIQ will re-assess (the decision's own reassessment trigger). */
  reassessmentTrigger: string;
}

/** Gate targets that rest on recorded control records, not on diagnosed domain data. */
export const OWNER_RECORDED_FACT_GATE_CODES: ReadonlySet<string> = new Set(["GATE_COMPLIANCE_EXPIRED", "GATE_CAPACITY_UNSAFE"]);

/** Gate targets that rest on the cash/finance reading. */
const CASH_GATE_CODES: ReadonlySet<string> = new Set(["GATE_CASH_UNSAFE", "GATE_PROFIT_UNSAFE"]);

export interface AdvicePolicyPrimary {
  source: OwnerCandidateSource;
  priorityClass: OwnerPriorityClass;
  findingCode: string;
  domain: string;
  /** The target's own reported missing data. */
  missingData: readonly string[];
}

export interface OwnerAdvicePolicyInput {
  state: "TARGET" | "NO_OPEN_ACTIONS" | "NO_EVIDENCE";
  primary: AdvicePolicyPrimary | null;
  /** The primary's intent (ownerTargetIntent); null without a primary. */
  intent: OwnerTargetIntent | null;
  primaryDomainLabel: string;
  dataSufficiency: {
    status: "sufficient" | "caution" | "insufficient";
    lowConfidenceDomains: readonly string[];
    missingCriticalData: readonly string[];
  };
  staleDomains: readonly string[];
  /** The primary rests on this period's in-progress cash/finance figures. */
  gateCashProvisional: boolean;
  /** Cash and Finance disagree and neither is more current (the worse reading applies as a fail-safe). */
  gateCashConflicting: boolean;
  missingInformation: readonly string[];
  reassessmentTrigger: string;
}

/** True when the primary is a recorded control fact (never softened by unrelated data gaps). */
export function isRecordedFactTarget(p: Pick<AdvicePolicyPrimary, "source" | "findingCode">): boolean {
  return p.source === "compliance_item" || p.source === "business_risk" || (p.source === "safety_gate" && OWNER_RECORDED_FACT_GATE_CODES.has(p.findingCode));
}

/** True when the primary is a request for evidence (a refresh, or the missing-critical-evidence class). */
export function isEvidenceRequestTarget(p: Pick<AdvicePolicyPrimary, "source" | "priorityClass">): boolean {
  return p.source === "evidence_refresh" || p.priorityClass === "MISSING_CRITICAL_EVIDENCE";
}

function claimTypeFor(p: AdvicePolicyPrimary): OwnerClaimType {
  if (isRecordedFactTarget(p)) return "RECORDED_FACT";
  if (p.priorityClass === "PLAN_COMMITMENT_RISK" || p.domain === "strategy") return "FORECAST_OR_PLAN";
  if (p.source === "survival_reading" || (p.source === "safety_gate" && CASH_GATE_CODES.has(p.findingCode))) return "CURRENT_MEASURED_CONDITION";
  if (p.source === "safety_gate") return "CURRENT_MEASURED_CONDITION";
  return "RECOMMENDATION";
}

const STATEMENT: Record<OwnerAdviceMode, string> = {
  SUPPORTED: "The current figures indicate this is your main target.",
  CAUTION: "The current figures indicate this, but the evidence is incomplete in places — treat it as a strong lead, not a certainty.",
  PROVISIONAL: "This needs attention now, but its score and diagnosis are provisional until the missing information is supplied.",
  REFRESH_REQUIRED: "The figures behind this are out of date, so OpsIQ cannot say the earlier problem still exists — confirm the figures first.",
  EVIDENCE_REQUIRED: "OpsIQ cannot support this decision yet: information it needs is missing.",
  RECORDED_FACT: "This is a recorded fact, not an estimate.",
  CONFLICT_REQUIRES_RESOLUTION: "Your cash and finance figures disagree and OpsIQ cannot tell which is current, so it applies the more cautious reading until they are reconciled.",
};

/**
 * Resolve the advice policy for the elected target. Pure and deterministic. It COMPOSES the decision's existing facts
 * (sufficiency status, stale/provisional domains, gate flags, missing information); it adds no score and never changes
 * which candidate was elected or the displayed confidence figures.
 */
export function resolveOwnerAdvicePolicy(input: OwnerAdvicePolicyInput): OwnerAdvicePolicy {
  const { primary, intent } = input;
  const missingEvidence = [...input.missingInformation];
  const base = { contractVersion: OWNER_ADVICE_POLICY_VERSION, reassessmentTrigger: input.reassessmentTrigger } as const;
  const sufficiency = input.dataSufficiency.status;
  const label = input.primaryDomainLabel;

  // ── No target ────────────────────────────────────────────────────────────────────────────────────────────────────
  if (input.state === "NO_EVIDENCE" || !primary) {
    const noData = input.state === "NO_EVIDENCE";
    // "Nothing is open" is only a claim when the evidence supports it: out-of-date or missing evidence is never read as resolved.
    const mode: OwnerAdviceMode = noData
      ? "EVIDENCE_REQUIRED"
      : input.staleDomains.length > 0
        ? "REFRESH_REQUIRED"
        : sufficiency === "insufficient"
          ? "EVIDENCE_REQUIRED"
          : sufficiency === "caution"
            ? "CAUTION"
            : "SUPPORTED";
    const reasons = noData
      ? ["There is no business data yet."]
      : mode === "REFRESH_REQUIRED"
        ? ["Some figures are out of date, so OpsIQ cannot say nothing needs doing in those areas."]
        : mode === "EVIDENCE_REQUIRED"
          ? ["Important data is missing, so OpsIQ cannot confirm that nothing needs doing."]
          : mode === "CAUTION"
            ? ["Some data is incomplete, so \"nothing open\" is not a guarantee."]
            : [];
    return {
      ...base,
      mode,
      claimType: null,
      canAct: false,
      canMakeMaterialCommitment: false,
      requiresEvidenceRefresh: mode === "REFRESH_REQUIRED",
      targetEvidence: "NOT_APPLICABLE",
      ownerStatement: mode === "SUPPORTED" ? "No open action remains in your diagnosed areas, on the current figures." : STATEMENT[mode],
      reasons,
      missingEvidence,
      nextEvidenceAction:
        mode === "SUPPORTED"
          ? ""
          : noData
            ? "Add your business numbers (sales, costs and cash), then re-run OpsIQ."
            : mode === "REFRESH_REQUIRED"
              ? "Update the out-of-date figures and re-run their diagnosis."
              : "Add the missing information listed, then re-run OpsIQ.",
    };
  }

  const claimType = claimTypeFor(primary);

  // ── Requests for evidence ────────────────────────────────────────────────────────────────────────────────────────
  if (primary.source === "evidence_refresh") {
    return {
      ...base,
      mode: "REFRESH_REQUIRED",
      claimType: "RECOMMENDATION",
      canAct: true,
      canMakeMaterialCommitment: false,
      requiresEvidenceRefresh: true,
      targetEvidence: "NOT_APPLICABLE",
      ownerStatement: STATEMENT.REFRESH_REQUIRED,
      reasons: ["The latest figures are out of date; what they last showed is not treated as current."],
      missingEvidence,
      nextEvidenceAction: `Update the ${label} figures and re-run its diagnosis.`,
    };
  }
  if (primary.priorityClass === "MISSING_CRITICAL_EVIDENCE") {
    return {
      ...base,
      mode: "EVIDENCE_REQUIRED",
      claimType: "RECOMMENDATION",
      canAct: true,
      canMakeMaterialCommitment: false,
      requiresEvidenceRefresh: false,
      targetEvidence: "NOT_APPLICABLE",
      ownerStatement: STATEMENT.EVIDENCE_REQUIRED,
      reasons: ["Critical information is missing; supplying it comes before advice that depends on it."],
      missingEvidence,
      nextEvidenceAction: missingEvidence[0] ? `Provide: ${missingEvidence[0]}` : `Provide the missing ${label} information, then re-run.`,
    };
  }

  // ── Conflicting authoritative evidence ───────────────────────────────────────────────────────────────────────────
  if (primary.source === "safety_gate" && CASH_GATE_CODES.has(primary.findingCode) && input.gateCashConflicting) {
    return {
      ...base,
      mode: "CONFLICT_REQUIRES_RESOLUTION",
      claimType: "CURRENT_MEASURED_CONDITION",
      canAct: true,
      canMakeMaterialCommitment: false,
      requiresEvidenceRefresh: true,
      targetEvidence: "TARGET_AREA_INCOMPLETE",
      ownerStatement: STATEMENT.CONFLICT_REQUIRES_RESOLUTION,
      reasons: ["Cash flow and Finance disagree and neither is more current; the more cautious reading applies until they are reconciled."],
      missingEvidence,
      nextEvidenceAction: "Confirm which figures are authoritative: update the older of Cash flow and Finance, then re-run both.",
    };
  }

  // ── Recorded facts ───────────────────────────────────────────────────────────────────────────────────────────────
  if (isRecordedFactTarget(primary)) {
    const gap = sufficiency !== "sufficient";
    return {
      ...base,
      mode: "RECORDED_FACT",
      claimType: "RECORDED_FACT",
      canAct: true,
      canMakeMaterialCommitment: true,
      requiresEvidenceRefresh: false,
      targetEvidence: "RECORDED_FACT",
      ownerStatement: STATEMENT.RECORDED_FACT,
      reasons: gap
        ? ["This rests on a recorded fact, so incomplete data elsewhere does not make it uncertain; analysis that depends on that data is unavailable until it is supplied."]
        : [],
      missingEvidence,
      nextEvidenceAction: gap ? "Resolve the recorded issue; separately, add the missing information listed so the rest of OpsIQ's analysis can be trusted." : "",
    };
  }

  // ── Data-derived targets ─────────────────────────────────────────────────────────────────────────────────────────
  const targetIncomplete = input.dataSufficiency.lowConfidenceDomains.includes(primary.domain) || primary.missingData.length > 0;
  const targetEvidence: OwnerTargetEvidence = targetIncomplete ? "TARGET_AREA_INCOMPLETE" : "TARGET_AREA_SUFFICIENT";
  const reasons: string[] = [];
  let mode: OwnerAdviceMode;
  if (input.gateCashProvisional) {
    mode = "PROVISIONAL";
    reasons.push("This rests on this period's in-progress figures, not a completed period; they can only tighten a check, never clear it.");
  } else if (sufficiency === "insufficient" && targetIncomplete) {
    mode = "PROVISIONAL";
    reasons.push(`Important ${label} data is missing, so the score and diagnosis are provisional even though the issue needs attention.`);
  } else if (sufficiency === "insufficient") {
    mode = "CAUTION";
    reasons.push(`Data in other areas is incomplete; ${label}'s own evidence is not flagged incomplete. OpsIQ still shows a lower confidence figure while business-wide data is short.`);
  } else if (sufficiency === "caution" || targetIncomplete) {
    mode = "CAUTION";
    reasons.push(targetIncomplete ? `Some ${label} information is missing for this target.` : "Some data is incomplete, so treat this advice with some caution.");
  } else {
    mode = "SUPPORTED";
  }
  if (claimType === "FORECAST_OR_PLAN" && mode === "SUPPORTED") {
    mode = "CAUTION";
    reasons.push("This is a plan estimate built on heuristic ratings, not a forecast; it is never presented as a predicted outcome.");
  }
  if (input.staleDomains.length > 0 && mode !== "PROVISIONAL") {
    reasons.push("Some other areas' figures are out of date and are not used here.");
  }

  const commitment =
    mode === "SUPPORTED" ||
    (mode === "CAUTION" && intent !== "GROW" && claimType !== "FORECAST_OR_PLAN" && sufficiency !== "insufficient");

  return {
    ...base,
    mode,
    claimType,
    canAct: true,
    canMakeMaterialCommitment: commitment,
    requiresEvidenceRefresh: false,
    targetEvidence,
    ownerStatement: STATEMENT[mode],
    reasons,
    missingEvidence,
    nextEvidenceAction:
      mode === "SUPPORTED"
        ? ""
        : missingEvidence[0]
          ? `Supply or confirm: ${missingEvidence[0]}, then re-run.`
          : `Add the missing ${label} information, then re-run.`,
  };
}

/**
 * The material-commitment statement for owner-wide guardrails (the Control Center), derived ONLY from the canonical policy.
 * `prohibition` is the "do not" wording; `condition` is the same limit phrased as how to carry out the main target. Null
 * when the policy permits a commitment (SUPPORTED, RECORDED_FACT, or a CAUTION that allows it): data-quality disclosure is
 * informational and never prohibits by itself.
 */
export function ownerMaterialCommitmentGuard(policy: OwnerAdvicePolicy): { prohibition: string; condition: string } | null {
  switch (policy.mode) {
    case "EVIDENCE_REQUIRED":
      return {
        prohibition: "Do not make material decisions until the missing data is provided.",
        condition: "hold other material decisions until the missing data is provided.",
      };
    case "REFRESH_REQUIRED":
      return {
        prohibition: "Do not make material decisions on out-of-date figures until they are confirmed.",
        condition: "hold other material decisions until the out-of-date figures are confirmed.",
      };
    case "CONFLICT_REQUIRES_RESOLUTION":
      return {
        prohibition: "Do not make material decisions until the conflicting cash and finance figures are reconciled.",
        condition: "hold other material decisions until the conflicting cash and finance figures are reconciled.",
      };
    case "PROVISIONAL":
      return {
        prohibition: "Do not commit money, capacity or a plan on provisional figures until the missing information is supplied.",
        condition: "hold commitments of money, capacity or a plan until the missing information is supplied.",
      };
    case "CAUTION":
      return policy.canMakeMaterialCommitment
        ? null
        : {
            prohibition: "Do not commit money, capacity or a plan on this evidence until the incomplete information is supplied.",
            condition: "hold commitments of money, capacity or a plan until the incomplete information is supplied.",
          };
    case "SUPPORTED":
    case "RECORDED_FACT":
      return null;
  }
}

/**
 * Only when NO canonical decision exists for the selected business (nothing to qualify): a sufficiency-only policy, so the
 * Control Center never keeps a separate permission rule. Insufficient data cannot support material decisions; otherwise there
 * is nothing to say.
 */
export function sufficiencyOnlyAdvicePolicy(status: "sufficient" | "caution" | "insufficient", reassessmentTrigger = ""): OwnerAdvicePolicy | null {
  if (status !== "insufficient") return null;
  return resolveOwnerAdvicePolicy({
    state: "NO_OPEN_ACTIONS",
    primary: null,
    intent: null,
    primaryDomainLabel: "",
    dataSufficiency: { status, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [],
    gateCashProvisional: false,
    gateCashConflicting: false,
    missingInformation: [],
    reassessmentTrigger,
  });
}
