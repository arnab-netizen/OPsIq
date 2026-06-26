/** D8 — Staff workload: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { StaffWorkloadInput } from "@/domain/domain-training/domains/staff-workload";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("hours", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("hours", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("hours", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("hours", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<StaffWorkloadInput>;
const NEWT = "no new non-critical tasks for overloaded staff";
const HIRE = "no hiring before workload proof unless emergency";
const BLAME = "no blaming staff without workload/SOP evidence";
function c(id: string, st: Case["scenarioType"], a: string, input: StaffWorkloadInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D8", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "workload", proofKeyword: "sustainable load", verificationKeyword: "utilization", sideEffectMetrics: ["error rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const REDIST = "Redistribute", UNDER = "Underutilized", MON = "Monitor", BAL = "balanced";

export const STAFF_WORKLOAD_CASES: Case[] = [
  c("D8-01", "clean_normal", "universal", { utilizationPct: 0.7, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: BAL }),
  c("D8-02", "clean_normal", "universal", { utilizationPct: 0.4, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: UNDER }),
  c("D8-03", "messy_real_world", "universal", { utilizationPct: 0.88, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [NEWT], nextActionKeyword: MON }),
  c("D8-04", "messy_real_world", "universal", { utilizationPct: 1.05, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }),
  c("D8-05", "adversarial", "universal", { utilizationPct: 1.1, ownerWantsAddTasks: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }, ["staff_overload"]),
  c("D8-06", "adversarial", "universal", { utilizationPct: 0.9, overtimeDependence: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }),
  c("D8-07", "missing_data", "universal", { utilizationPct: 1.05, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }),
  c("D8-08", "missing_data", "universal", { utilizationPct: 0.88, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [NEWT], nextActionKeyword: MON }),
  c("D8-09", "cross_pressure", "universal", { utilizationPct: 1.05, ownerWantsHireNoProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT, HIRE], nextActionKeyword: REDIST }),
  c("D8-10", "cross_pressure", "universal", { utilizationPct: 0.88, ownerBlamesStaffNoEvidence: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [NEWT, BLAME], nextActionKeyword: MON }),
  c("D8-11", "archetype_laundry", "laundry", { utilizationPct: 1.1, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }),
  c("D8-12", "archetype_laundry", "laundry", { utilizationPct: 0.7, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: BAL }),
  c("D8-13", "archetype_housekeeping", "housekeeping", { utilizationPct: 0.95, overtimeDependence: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }),
  c("D8-14", "archetype_housekeeping", "housekeeping", { utilizationPct: 0.86, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [NEWT], nextActionKeyword: MON }),
  c("D8-15", "owner_pressure", "universal", { utilizationPct: 1.1, ownerWantsAddTasks: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }, ["staff_overload"]),
  c("D8-16", "owner_pressure", "universal", { utilizationPct: 0.88, ownerWantsHireNoProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [NEWT, HIRE], nextActionKeyword: MON }),
  c("D8-17", "false_completion", "universal", { utilizationPct: 1.05, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }),
  c("D8-18", "false_completion", "laundry", { utilizationPct: 0.88, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [NEWT], nextActionKeyword: MON }),
  c("D8-19", "vanity_metric", "universal", { utilizationPct: 1.1, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }, ["vanity_metric_optimization"]),
  c("D8-20", "adversarial", "housekeeping", { utilizationPct: 0.88, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [NEWT], nextActionKeyword: MON }),
  c("D8-21", "missing_data", "universal", { utilizationPct: 1.05, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [NEWT], nextActionKeyword: REDIST }),
];
