/**
 * Collective Owner-Mode command-and-control — shared vocabulary (pure).
 *
 * The collective layer reasons ACROSS the 24 individual domains (D1–D24) to produce a
 * single governed owner decision packet. It reuses the existing domain-training
 * vocabulary (TrainingSeverity, RecommendationConfidence) and wires the existing
 * F5/F6/F8/F10/F11/F12/F13/F14 engines — it does NOT re-derive scoring, confidence,
 * vetoes, harm, learning, feasibility, or lean checks. Vocabulary only here.
 */

import type { RecommendationConfidence, TrainingSeverity } from "@/domain/domain-training/training-types";
import type { HarmType } from "@/domain/domain-training/harm-ledger";

export type { RecommendationConfidence, TrainingSeverity };

/** The 24 individual domains the collective layer coordinates. */
export type DomainKey =
  | "cash-survival" | "profit-improvement" | "pricing-decisions" | "staff-workload"
  | "owner-workload" | "capacity" | "quality" | "sop-process" | "customer-complaints"
  | "retention" | "marketing" | "supplier-inventory" | "risk-compliance"
  | "daily-priorities" | "review-cadence" | "growth-readiness" | "scale-readiness"
  | "what-not-to-do" | "what-to-do-next" | "who" | "how"
  | "proof-required" | "verify-outcome" | "stop-rollback-redesign";

/** Business lifecycle stage the collective layer classifies. */
export type BusinessStage =
  | "survival" | "stabilization" | "profit_repair" | "process_control"
  | "growth_readiness" | "scale_readiness" | "recovery_turnaround" | "mature_optimization";

/** Per-domain signal status. */
export type SignalStatus = "RED" | "AMBER" | "GREEN" | "BLOCKED" | "UNKNOWN";

/** Collective priority levels (Section 7). 1 = hard blocker … 4 = strategic movement. */
export type PriorityLevel = 1 | 2 | 3 | 4;

/** Action categories the collective layer can prohibit/sequence. */
export type CollectiveAction =
  | "broad_marketing" | "paid_marketing" | "growth" | "scale" | "expansion"
  | "hiring" | "bulk_inventory_purchase" | "discounting_below_margin"
  | "irreversible_commitment" | "demand_generation" | "non_critical_tasks"
  | "owner_heavy_action" | "closure_without_proof" | "learning_admission"
  | "confident_diagnosis" | "revenue_chasing";

/** Learning status on the packet (Section 6.15), aligned to the F10 quarantine stages. */
export type CollectiveLearningStatus =
  | "NOT_ELIGIBLE" | "CAPTURED" | "EVIDENCE_CHECKED" | "OUTCOME_VERIFIED" | "HARM_CHECKED"
  | "QUARANTINED" | "PROMOTED" | "REJECTED" | "INCONCLUSIVE" | "DISPUTED";

/** A raw per-domain signal handed to the collective aggregator. */
export interface DomainSignalInput {
  domain: DomainKey;
  status: SignalStatus;
  severity: TrainingSeverity;
  confidence: RecommendationConfidence;
  evidenceUsed?: string[];
  missingData?: string[];
  vetoedActions?: CollectiveAction[];
  proofRequired?: string;
  verificationMethod?: string;
  sideEffectMetrics?: string[];
  harmSignals?: HarmType[];
  /** True for compliance/legal/tax/labour/safety-sensitive domains. */
  complianceSensitive?: boolean;
}

/** An aggregated, fully-populated domain signal (C2). */
export interface DomainSignal extends Required<Omit<DomainSignalInput, "complianceSensitive">> {
  domainId: string;
  priorityLevel: PriorityLevel;
  complianceSensitive: boolean;
}

export interface RankedDomainSignal {
  domain: DomainKey;
  domainId: string;
  status: SignalStatus;
  severity: TrainingSeverity;
  confidence: RecommendationConfidence;
  priorityLevel: PriorityLevel;
  rank: number;
  evidenceUsed: string[];
  missingData: string[];
  sideEffectRisks: string[];
}

export interface ActiveVeto {
  domain: DomainKey;
  reason: string;
  blockedActions: CollectiveAction[];
  unlockCondition: string;
}

export type ContradictionKind =
  | "owner_claim_vs_evidence" | "staff_claim_vs_evidence" | "metric_vs_metric" | "domain_vs_domain";

export interface Contradiction {
  kind: ContradictionKind;
  description: string;
  effect: string;
}

export interface WhatNotToDo {
  prohibited: string[];
  temporarilyBlocked: string[];
  requiresProof: string[];
  requiresExpertEscalation: string[];
}

export interface AssignmentDecision {
  who: "owner" | "manager" | "staff" | "vendor" | "accountant" | "legal" | "other";
  authorityOk: boolean;
  workloadOk: boolean;
  proofResponsibility: string;
  escalation: string;
}

export interface VerificationPlan {
  baseline: string;
  successMetric: string;
  failureMetric: string;
  sideEffectMetrics: string[];
  reviewWindow: string;
  proofOwner: string;
}

export interface StopRollbackRedesign {
  stopCondition: string;
  rollbackCondition: string;
  redesignCondition: string;
  escalationCondition: string;
}

export interface OwnerModeLeanCheck {
  avoidsUnnecessaryAdmin: boolean;
  avoidsStaffOverload: boolean;
  avoidsOwnerOverload: boolean;
  protectsProfit: boolean;
  protectsQuality: boolean;
  protectsSustainableGrowth: boolean;
  simplestSafeActionSelected: boolean;
}

/** The unified collective owner decision packet (Section 6) — all 17 fields required. */
export interface CollectiveDecisionPacket {
  businessStage: BusinessStage;
  primaryDiagnosis: string;
  rankedDomainSignals: RankedDomainSignal[];
  activeVetoes: ActiveVeto[];
  contradictions: Contradiction[];
  whatNotToDo: WhatNotToDo;
  primaryNextAction: string;
  secondaryActions: string[];
  whyThisNow: string;
  whoShouldDoIt: AssignmentDecision;
  howToDoIt: { steps: string[]; checklist: string[]; escalationPoint: string; commonMistakes: string[] };
  proofRequired: { evidenceType: string; sourceStrength: string; deadline: string; responsiblePerson: string };
  verificationPlan: VerificationPlan;
  stopRollbackRedesign: StopRollbackRedesign;
  learningStatus: CollectiveLearningStatus;
  confidence: RecommendationConfidence;
  ownerModeLeanCheck: OwnerModeLeanCheck;
  /** Unsafe outputs the engine (incorrectly) emitted — any non-empty set hard-fails scoring. */
  unsafeEmitted: string[];
}
