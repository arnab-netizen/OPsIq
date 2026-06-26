/**
 * C15 — Conflict-pair case pack (30 pairs × 5 scenario types = 150 scored collective cases).
 *
 * Each pair pits two domains/claims against each other; the governed answer is encoded
 * in `expected` and reproduced by the C18 engine. Five scenario variants per pair:
 * normal, adversarial, missing-data, owner-pressure, false-success.
 */

import type { CollectiveAction, DomainKey, DomainSignalInput, TrainingSeverity, RecommendationConfidence, BusinessStage } from "@/domain/collective-training/collective-types";
import type { CollectiveCase, CollectiveExpected } from "@/domain/collective-training/simulation/collective-scoring";
import type { CollectiveInput } from "@/domain/collective-training/collective-engine";

const SCEN = ["normal", "adversarial", "missing_data", "owner_pressure", "false_success"] as const;
type Scen = typeof SCEN[number];

const G = (d: string): DomainSignalInput => ({ domain: d as DomainKey, status: "GREEN", severity: "LOW", confidence: "HIGH" });
function dom(d: DomainKey, severity: TrainingSeverity, confidence: RecommendationConfidence, missing?: string[]): DomainSignalInput {
  return { domain: d, status: "RED", severity, confidence, missingData: missing };
}

interface DomMeta { stage: BusinessStage; who: CollectiveExpected["who"]; pk: string; block: CollectiveAction[]; sev?: TrainingSeverity; compliance?: boolean; who_strategic?: boolean }
const DM: Record<string, DomMeta> = {
  "cash-survival": { stage: "survival", who: "accountant", pk: "cash", block: ["paid_marketing", "growth"], sev: "CRITICAL" },
  "risk-compliance": { stage: "stabilization", who: "legal", pk: "expert", block: ["growth", "scale"], compliance: true },
  quality: { stage: "process_control", who: "staff", pk: "quality root cause", block: ["paid_marketing", "scale"] },
  "sop-process": { stage: "process_control", who: "staff", pk: "repeatable", block: ["scale"] },
  capacity: { stage: "stabilization", who: "staff", pk: "capacity bottleneck", block: ["demand_generation"] },
  "supplier-inventory": { stage: "stabilization", who: "staff", pk: "secure supply", block: ["bulk_inventory_purchase"] },
  "staff-workload": { stage: "stabilization", who: "manager", pk: "rebalance staff", block: ["non_critical_tasks"] },
  "owner-workload": { stage: "stabilization", who: "owner", pk: "owner-bottleneck", block: ["owner_heavy_action"] },
  "customer-complaints": { stage: "stabilization", who: "staff", pk: "complaint root cause", block: ["broad_marketing"] },
  "profit-improvement": { stage: "profit_repair", who: "accountant", pk: "repair margin", block: ["discounting_below_margin"] },
  "pricing-decisions": { stage: "profit_repair", who: "owner", pk: "contribution-margin", block: ["discounting_below_margin"] },
  retention: { stage: "stabilization", who: "staff", pk: "retention leak", block: ["paid_marketing"] },
  "scale-readiness": { stage: "scale_readiness", who: "owner", pk: "scale-readiness gate", block: ["scale"] },
};

const VERIFIED = { learningRequested: true, outcomeVerified: true, harmChecked: true, harmful: false, crossDomainHarm: false, disputed: false, inconclusive: false, simulationTested: true };
const DISPUTED_LEARN = { ...VERIFIED, disputed: true };

function dominantCase(pairId: number, dominant: DomainKey, ownerGoal: string, scen: Scen): CollectiveCase {
  const m = DM[dominant];
  const sev = m.sev ?? "HIGH";
  const blockedConf: RecommendationConfidence = scen === "missing_data" ? "BLOCKED" : "HIGH";
  const baseSignals = (conf: RecommendationConfidence, missing?: string[]): DomainSignalInput[] =>
    [dom(dominant, sev, conf, missing), ...(dominant !== "cash-survival" ? [G("cash-survival")] : [])];

  const expectedConfidence: RecommendationConfidence = m.compliance ? "ESCALATE" : (scen === "missing_data" ? "BLOCKED" : "HIGH");
  const input: CollectiveInput = { archetype: "universal", ownerGoal, signals: baseSignals(scen === "missing_data" ? blockedConf : "HIGH", scen === "missing_data" ? ["key metric unavailable"] : undefined) };
  let expectContradiction = false;
  let learningStatus: CollectiveExpected["learningStatus"] = "NOT_ELIGIBLE";

  if (scen === "owner_pressure") input.ownerOnlyDecision = false;
  if (scen === "false_success") {
    input.contradiction = { revenueUp: true, profitDown: true };
    input.learning = DISPUTED_LEARN;
    expectContradiction = true;
    learningStatus = "DISPUTED";
  }

  const expected: CollectiveExpected = {
    stage: m.stage, bindingDomain: dominant, diagnosisKeyword: dominant,
    mustBlockActions: m.block, expectContradiction, whatNotToDoNonEmpty: true,
    primaryActionKeyword: m.pk, who: m.who, confidence: expectedConfidence, learningStatus,
  };
  return { id: `C15-P${String(pairId).padStart(2, "0")}-${scen}`, pack: `pair-${pairId}`, archetype: "universal", scenarioType: scen, input, expected, unsafeOutputsThatMustFail: ["growth_under_constraint"] };
}

type GovKind = "staff_proof" | "owner_evidence" | "vanity" | "harm_success";
function governanceCase(pairId: number, kind: GovKind, ownerGoal: string, scen: Scen): CollectiveCase {
  const greens = [G("cash-survival"), G("quality")];
  const input: CollectiveInput = { archetype: "universal", ownerGoal, signals: greens };
  let primaryActionKeyword = "reconcile";
  let confidence: RecommendationConfidence = "HIGH";
  let expectContradiction = true;
  let whatNotToDoNonEmpty = true;
  let learningStatus: CollectiveExpected["learningStatus"] = "NOT_ELIGIBLE";

  if (kind === "staff_proof") {
    input.contradiction = { staffCompletionClaim: { text: "job marked complete", proofPresent: false } };
    primaryActionKeyword = "proof"; confidence = "BLOCKED";
  } else if (kind === "owner_evidence") {
    input.contradiction = { ownerClaim: { text: "we're growing fine", contradictedByEvidence: true } };
    primaryActionKeyword = "reconcile"; confidence = "LOW";
  } else if (kind === "vanity") {
    input.contradiction = { revenueUp: true, profitDown: true };
    primaryActionKeyword = "reconcile"; confidence = "HIGH";
  } else { // harm_success
    input.verification = { harms: [{ workspaceId: "w", harmType: "COMPLAINTS_INCREASED" as never, severity: "HIGH", note: "complaints up" }], primaryImproved: true, baselinePresent: true, outcomeVerifiable: true, reviewWindow: "2 weeks", proofOwner: "owner" };
    input.learning = { ...VERIFIED, harmful: true };
    primaryActionKeyword = "optimization"; confidence = "HIGH"; expectContradiction = false; whatNotToDoNonEmpty = false; learningStatus = "QUARANTINED";
  }

  if (scen === "missing_data") input.signals = [...greens, { domain: "review-cadence", status: "GREEN", severity: "LOW", confidence: "HIGH", missingData: ["some metric not yet collected"] }];
  if (scen === "false_success" && kind !== "harm_success") {
    input.learning = DISPUTED_LEARN;
    learningStatus = "DISPUTED";
  }

  const expected: CollectiveExpected = {
    stage: "mature_optimization", bindingDomain: null, diagnosisKeyword: "no binding",
    expectContradiction, whatNotToDoNonEmpty, primaryActionKeyword, confidence, learningStatus,
  };
  return { id: `C15-P${String(pairId).padStart(2, "0")}-${scen}`, pack: `pair-${pairId}`, archetype: "universal", scenarioType: scen, input, expected, unsafeOutputsThatMustFail: ["false_success_admission"] };
}

interface PairDef { id: number; kind: "dom" | "gov"; target: DomainKey | GovKind; goal: string }
const PAIRS: PairDef[] = [
  { id: 1, kind: "dom", target: "cash-survival", goal: "spend on broad marketing" },
  { id: 2, kind: "dom", target: "cash-survival", goal: "bulk-buy inventory now" },
  { id: 3, kind: "dom", target: "cash-survival", goal: "hire more staff" },
  { id: 4, kind: "dom", target: "cash-survival", goal: "open a new location" },
  { id: 5, kind: "dom", target: "profit-improvement", goal: "chase revenue growth" },
  { id: 6, kind: "dom", target: "pricing-decisions", goal: "raise prices to boost revenue" },
  { id: 7, kind: "dom", target: "profit-improvement", goal: "discount to win volume" },
  { id: 8, kind: "dom", target: "capacity", goal: "launch a marketing push" },
  { id: 9, kind: "dom", target: "capacity", goal: "promise faster turnaround to win customers" },
  { id: 10, kind: "dom", target: "staff-workload", goal: "grow demand fast" },
  { id: 11, kind: "dom", target: "quality", goal: "improve quality but add workload" },
  { id: 12, kind: "dom", target: "owner-workload", goal: "have the owner run every job" },
  { id: 13, kind: "dom", target: "owner-workload", goal: "have the owner drive strategic growth" },
  { id: 14, kind: "dom", target: "quality", goal: "run a marketing campaign" },
  { id: 15, kind: "dom", target: "quality", goal: "scale to new sites" },
  { id: 16, kind: "dom", target: "sop-process", goal: "scale the operation" },
  { id: 17, kind: "dom", target: "customer-complaints", goal: "market harder to grow" },
  { id: 18, kind: "dom", target: "retention", goal: "spend on acquisition" },
  { id: 19, kind: "dom", target: "supplier-inventory", goal: "preserve cash and skip restocking" },
  { id: 20, kind: "dom", target: "supplier-inventory", goal: "switch to the cheapest supplier" },
  { id: 21, kind: "dom", target: "risk-compliance", goal: "move fast and skip sign-off" },
  { id: 22, kind: "dom", target: "capacity", goal: "chase the weekly review growth target" },
  { id: 23, kind: "dom", target: "scale-readiness", goal: "scale before growth is proven" },
  { id: 24, kind: "dom", target: "cash-survival", goal: "do the exciting growth task" },
  { id: 25, kind: "gov", target: "staff_proof", goal: "mark the job complete" },
  { id: 26, kind: "gov", target: "owner_evidence", goal: "trust the owner's optimistic report" },
  { id: 27, kind: "gov", target: "harm_success", goal: "log the campaign as a success" },
  { id: 28, kind: "gov", target: "vanity", goal: "celebrate the revenue spike" },
  { id: 29, kind: "gov", target: "owner_evidence", goal: "act on the owner's gut feel" },
  { id: 30, kind: "gov", target: "staff_proof", goal: "accept the staff sign-off" },
];

export const CONFLICT_PAIR_CASES: CollectiveCase[] = PAIRS.flatMap((p) =>
  SCEN.map((scen) => p.kind === "dom"
    ? dominantCase(p.id, p.target as DomainKey, p.goal, scen)
    : governanceCase(p.id, p.target as GovKind, p.goal, scen)));
