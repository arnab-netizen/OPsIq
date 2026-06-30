/**
 * Owner Pilot READINESS SCORE.
 *
 * A composite, deterministic score across ten dimensions that answers ONE question: is this business
 * set up well enough for a real owner pilot? It consumes the SAME proven signals as the rest of the
 * system (the dynamic input guidance for confidence/missing data, plus a runtime summary for proof,
 * owner burden, learning, and the max-reliability gate). It never recomputes confidence upward.
 *
 * Hard gating (tested): the overall score cannot read high, and `pilotReady` is false, when any of
 * these holds — critical data missing, proof path missing, too many manual owner actions, weak
 * financial confidence, weak staff/capacity data, recommendation not actionable, runtime path missing,
 * or the max-reliability ratchet not green. Irrelevant data never raises the score.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
import {
  buildInputGuidance,
} from "@/domain/owner-mode/input-guidance";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import {
  requiredInputsForProfile,
  type BusinessProfileType,
  type OwnerRole,
} from "@/domain/owner-mode/owner-onboarding";
import type { Confidence } from "@/services/owner-mode/owner-domain-ingestion";

export type ReadinessDimensionKey =
  | "data_readiness"
  | "diagnosis_confidence"
  | "actionability"
  | "proof_readiness"
  | "staff_delegation_readiness"
  | "financial_confidence"
  | "customer_reputation_confidence"
  | "capacity_staff_confidence"
  | "risk_compliance_confidence"
  | "learning_provenance_readiness";

export interface ReadinessDimension {
  key: ReadinessDimensionKey;
  label: string;
  score: number; // 0–100
  weak: boolean;
}

export interface ReadinessRuntimeSummary {
  /** A concrete, runtime-generated next best action exists. */
  nextBestActionPresent: boolean;
  /** Number of manual actions the owner must personally do (high ⇒ burden too high). */
  ownerManualActionCount: number;
  /** Work OpsIQ/staff can take off the owner. */
  delegatedWorkCount: number;
  /** Outstanding proof requirements. */
  proofRequiredCount: number;
  /** Red (failing) domains from the runtime plan. */
  redDomains: string[];
  /** Stored learning was applied. */
  learningApplied: boolean;
  /** Critical domains are real provider-backed (not fixture/context). */
  realProviderBacked: boolean;
  /** The production runtime path produced this (vs. a static fallback). */
  runtimePathAvailable: boolean;
  /** The max-reliability ratchet is green for this build. */
  maxReliabilityGreen: boolean;
}

export interface OwnerPilotReadiness {
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  overallScore: number; // 0–100
  pilotReady: boolean;
  overallConfidence: Confidence;
  dimensions: ReadinessDimension[];
  blockers: string[];
}

export interface AssessReadinessInput {
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  suppliedCategories: OwnerInputCategory[];
  runtime: ReadinessRuntimeSummary;
}

const CONFIDENCE_SCORE: Record<Confidence, number> = { none: 0, low: 35, medium: 70, high: 95 };

const FINANCIAL_CATS: OwnerInputCategory[] = ["revenue_sales", "expenses", "fixed_costs", "payroll", "cash_debt"];
const CUSTOMER_CATS: OwnerInputCategory[] = ["complaints_reviews", "customer_count"];
const CAPACITY_CATS: OwnerInputCategory[] = ["staff_attendance", "equipment_logs", "staff_rota"];
const COMPLIANCE_CATS: OwnerInputCategory[] = ["tax_compliance", "proof_completion"];
const DELEGATION_CATS: OwnerInputCategory[] = ["sops_checklists", "staff_training", "staff_attendance"];

/** Owner has too many manual actions beyond this. */
const OWNER_MANUAL_ACTION_LIMIT = 5;
/** Per-dimension weakness threshold. */
const WEAK_THRESHOLD = 50;
/** Overall is capped at this whenever any hard blocker is present (cannot read high on weak setup). */
const BLOCKED_OVERALL_CAP = 55;
/** pilotReady requires at least this overall AND zero blockers. */
const PILOT_READY_MIN = 75;

/** Fraction (0–100) of a profile-relevant category group that is supplied. N/A groups score full. */
function groupScore(group: OwnerInputCategory[], relevant: Set<OwnerInputCategory>, supplied: Set<OwnerInputCategory>): number {
  const relevantInGroup = group.filter((c) => relevant.has(c));
  if (relevantInGroup.length === 0) return 100; // not applicable to this profile → not penalised
  const have = relevantInGroup.filter((c) => supplied.has(c)).length;
  return Math.round((have / relevantInGroup.length) * 100);
}

export function assessOwnerPilotReadiness(input: AssessReadinessInput): OwnerPilotReadiness {
  const { profileType, ownerRole, runtime } = input;
  const supplied = new Set(input.suppliedCategories);
  const req = requiredInputsForProfile(profileType, ownerRole);
  const relevant = new Set<OwnerInputCategory>([...req.minimumRequired, ...req.recommended]);

  const guidance = buildInputGuidance({ profileType, ownerRole, suppliedCategories: input.suppliedCategories });
  const criticalAllReal = guidance.canProceedWithStrongRecommendation;

  // Data readiness — fraction of the minimum supplied, hard-capped when a critical is missing.
  const minHave = req.minimumRequired.filter((c) => supplied.has(c)).length;
  const dataRaw = req.minimumRequired.length === 0 ? 100 : Math.round((minHave / req.minimumRequired.length) * 100);
  const dataReadiness = criticalAllReal ? dataRaw : Math.min(dataRaw, 45);

  // Diagnosis confidence — from the honest projected confidence.
  const diagnosisConfidence = CONFIDENCE_SCORE[guidance.overallConfidence];

  // Actionability — a runtime action exists AND OpsIQ is allowed to act.
  const actionability = runtime.nextBestActionPresent ? (criticalAllReal ? 90 : 45) : 15;

  // Proof readiness — a proof path must exist; outstanding proofs lower it.
  const proofReadiness = supplied.has("proof_completion")
    ? (runtime.proofRequiredCount === 0 ? 95 : 70)
    : 20;

  // Staff delegation readiness.
  const delegationData = groupScore(DELEGATION_CATS, relevant, supplied);
  const staffDelegationReadiness = Math.round(0.6 * delegationData + 0.4 * (runtime.delegatedWorkCount > 0 ? 100 : 30));

  // Financial / customer / capacity / compliance confidence from supplied data groups.
  const financialConfidence = Math.min(groupScore(FINANCIAL_CATS, relevant, supplied), criticalAllReal ? 100 : 45);
  const customerReputationConfidence = groupScore(CUSTOMER_CATS, relevant, supplied);
  const capacityStaffConfidence = groupScore(CAPACITY_CATS, relevant, supplied);
  const complianceGroup = groupScore(COMPLIANCE_CATS, relevant, supplied);
  const riskComplianceConfidence = runtime.redDomains.some((d) => /complian|legal|proof/i.test(d))
    ? Math.min(complianceGroup, 40)
    : complianceGroup;

  // Learning / provenance readiness.
  const learningProvenanceReadiness = Math.round(
    (runtime.runtimePathAvailable ? 40 : 0) +
      (runtime.realProviderBacked ? 35 : 0) +
      (runtime.learningApplied ? 25 : 0),
  );

  const dimensions: ReadinessDimension[] = [
    { key: "data_readiness", label: "Data readiness", score: dataReadiness, weak: dataReadiness < WEAK_THRESHOLD },
    { key: "diagnosis_confidence", label: "Diagnosis confidence", score: diagnosisConfidence, weak: diagnosisConfidence < WEAK_THRESHOLD },
    { key: "actionability", label: "Actionability", score: actionability, weak: actionability < WEAK_THRESHOLD },
    { key: "proof_readiness", label: "Proof readiness", score: proofReadiness, weak: proofReadiness < WEAK_THRESHOLD },
    { key: "staff_delegation_readiness", label: "Staff delegation readiness", score: staffDelegationReadiness, weak: staffDelegationReadiness < WEAK_THRESHOLD },
    { key: "financial_confidence", label: "Financial confidence", score: financialConfidence, weak: financialConfidence < WEAK_THRESHOLD },
    { key: "customer_reputation_confidence", label: "Customer / reputation confidence", score: customerReputationConfidence, weak: customerReputationConfidence < WEAK_THRESHOLD },
    { key: "capacity_staff_confidence", label: "Capacity / staff confidence", score: capacityStaffConfidence, weak: capacityStaffConfidence < WEAK_THRESHOLD },
    { key: "risk_compliance_confidence", label: "Risk / compliance confidence", score: riskComplianceConfidence, weak: riskComplianceConfidence < WEAK_THRESHOLD },
    { key: "learning_provenance_readiness", label: "Learning / provenance readiness", score: learningProvenanceReadiness, weak: learningProvenanceReadiness < WEAK_THRESHOLD },
  ];

  // Hard blockers.
  const blockers: string[] = [];
  if (!criticalAllReal) blockers.push("Critical business data is missing — finish the minimum inputs first.");
  if (!supplied.has("proof_completion")) blockers.push("No proof path set up — actions can't be verified before they count as done.");
  if (runtime.ownerManualActionCount > OWNER_MANUAL_ACTION_LIMIT) blockers.push("Too many actions land on the owner — delegate or stage them before piloting.");
  if (financialConfidence < WEAK_THRESHOLD) blockers.push("Financial confidence is weak — add revenue, expenses, and cash/debt.");
  if (capacityStaffConfidence < WEAK_THRESHOLD) blockers.push("Staff / capacity data is weak — OpsIQ can't size what you can take on.");
  if (!runtime.nextBestActionPresent) blockers.push("No actionable recommendation yet — the runtime needs more data to act.");
  if (!runtime.runtimePathAvailable) blockers.push("No live runtime path — readiness requires real runtime-fed output, not a static card.");
  if (!runtime.maxReliabilityGreen) blockers.push("Max-reliability ratchet is not green — readiness is blocked until it passes.");

  const weightedOverall = Math.round(
    dimensions.reduce((acc, d) => acc + d.score, 0) / dimensions.length,
  );
  const overallScore = blockers.length > 0 ? Math.min(weightedOverall, BLOCKED_OVERALL_CAP) : weightedOverall;
  const pilotReady = blockers.length === 0 && overallScore >= PILOT_READY_MIN;

  return {
    profileType,
    ownerRole,
    overallScore,
    pilotReady,
    overallConfidence: guidance.overallConfidence,
    dimensions,
    blockers,
  };
}
