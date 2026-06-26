/** D12 — Customer complaints: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { ComplaintInput } from "@/domain/domain-training/domains/customer-complaints";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("c", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("c", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("c", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("c", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<ComplaintInput>;
const NOPROOF = "no closing the complaint without recovery proof", PATTERN = "no treating the complaint as isolated when a pattern exists";
function c(id: string, st: Case["scenarioType"], a: string, input: ComplaintInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D12", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "complaint", proofKeyword: "recovery action proof", verificationKeyword: "recovery", sideEffectMetrics: ["repeat complaint rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const ROOT = "root cause", RUN = "recovery action", CLOSE = "close the complaint";

export const CUSTOMER_COMPLAINTS_CASES: Case[] = [
  c("D12-01", "clean_normal", "universal", { severity: "low", recoveryProofPresent: true, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: CLOSE }),
  c("D12-02", "clean_normal", "universal", { severity: "medium", recoveryProofPresent: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: CLOSE }),
  c("D12-03", "messy_real_world", "universal", { severity: "high", dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-04", "messy_real_world", "universal", { severity: "medium", dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-05", "adversarial", "universal", { severity: "high", ownerWantsCloseNoProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }, ["premature_closure"]),
  c("D12-06", "adversarial", "universal", { severity: "high", repeatPattern: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NOPROOF, PATTERN], nextActionKeyword: ROOT }),
  c("D12-07", "missing_data", "universal", { severity: "high", dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-08", "missing_data", "universal", { severity: "medium", dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-09", "cross_pressure", "universal", { severity: "high", repeatPattern: true, recoveryProofPresent: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [PATTERN], nextActionKeyword: ROOT }),
  c("D12-10", "cross_pressure", "universal", { severity: "medium", repeatPattern: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [NOPROOF, PATTERN], nextActionKeyword: ROOT }),
  c("D12-11", "archetype_laundry", "laundry", { severity: "high", reputationRisk: true, dataPoints: VER }, { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-12", "archetype_laundry", "laundry", { severity: "low", recoveryProofPresent: true, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: CLOSE }),
  c("D12-13", "archetype_housekeeping", "housekeeping", { severity: "high", repeatPattern: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NOPROOF, PATTERN], nextActionKeyword: ROOT }),
  c("D12-14", "archetype_housekeeping", "housekeeping", { severity: "medium", recoveryProofPresent: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: CLOSE }),
  c("D12-15", "owner_pressure", "universal", { severity: "high", ownerWantsCloseNoProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }, ["premature_closure"]),
  c("D12-16", "owner_pressure", "universal", { severity: "medium", ownerWantsCloseNoProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-17", "false_completion", "universal", { severity: "high", ownerWantsCloseNoProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }, ["false_proof_acceptance"]),
  c("D12-18", "false_completion", "laundry", { severity: "medium", dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-19", "vanity_metric", "universal", { severity: "high", repeatPattern: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NOPROOF, PATTERN], nextActionKeyword: ROOT }, ["vanity_metric_optimization"]),
  c("D12-20", "adversarial", "housekeeping", { severity: "medium", complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
  c("D12-21", "missing_data", "universal", { severity: "high", dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [NOPROOF], nextActionKeyword: RUN }),
];
