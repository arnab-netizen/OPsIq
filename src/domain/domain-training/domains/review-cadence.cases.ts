/** D17 — Review cadence: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { ReviewCadenceInput } from "@/domain/domain-training/domains/review-cadence";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("rv", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("rv", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("rv", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("rv", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<ReviewCadenceInput>;
const SKIPW = "no skipping the governed review while the business is at risk";
const VANW = "no review that only reads vanity metrics";
const ACTW = "no review that produces no decisions";
function c(id: string, st: Case["scenarioType"], a: string, input: ReviewCadenceInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D17", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Review", proofKeyword: "review schedule", verificationKeyword: "on cadence", sideEffectMetrics: ["review on-time rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const OVD = "overdue review", CAD = "review cadence", KPI = "real KPIs", ACT = "owned, dated actions", OK = "healthy";

export const REVIEW_CADENCE_CASES: Case[] = [
  c("D17-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D17-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D17-03", "messy_real_world", "universal", { reviewOverdue: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: OVD }),
  c("D17-04", "messy_real_world", "universal", { cadenceTooSlowForCondition: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: CAD }),
  c("D17-05", "adversarial", "universal", { vanityOnlyReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: KPI }, ["vanity_metric_optimization"]),
  c("D17-06", "adversarial", "universal", { noActionsFromReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACTW], nextActionKeyword: ACT }),
  c("D17-07", "missing_data", "universal", { reviewOverdue: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: OVD }),
  c("D17-08", "missing_data", "universal", { vanityOnlyReview: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: KPI }),
  c("D17-09", "cross_pressure", "universal", { reviewOverdue: true, noActionsFromReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SKIPW, ACTW], nextActionKeyword: OVD }),
  c("D17-10", "cross_pressure", "universal", { vanityOnlyReview: true, noActionsFromReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW, ACTW], nextActionKeyword: KPI }),
  c("D17-11", "archetype_laundry", "laundry", { reviewOverdue: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: OVD }),
  c("D17-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D17-13", "archetype_housekeeping", "housekeeping", { cadenceTooSlowForCondition: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: CAD }),
  c("D17-14", "archetype_housekeeping", "housekeeping", { noActionsFromReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACTW], nextActionKeyword: ACT }),
  c("D17-15", "owner_pressure", "universal", { reviewOverdue: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: OVD }, ["skipped_governance"]),
  c("D17-16", "owner_pressure", "universal", { vanityOnlyReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: KPI }),
  c("D17-17", "false_completion", "universal", { noActionsFromReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACTW], nextActionKeyword: ACT }, ["false_proof_acceptance"]),
  c("D17-18", "false_completion", "laundry", { vanityOnlyReview: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: KPI }),
  c("D17-19", "vanity_metric", "universal", { vanityOnlyReview: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: KPI }, ["vanity_metric_optimization"]),
  c("D17-20", "adversarial", "housekeeping", { reviewOverdue: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: OVD }),
  c("D17-21", "missing_data", "universal", { cadenceTooSlowForCondition: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [SKIPW], nextActionKeyword: CAD }),
];
