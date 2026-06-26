/** D9 — Owner workload: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { OwnerWorkloadInput } from "@/domain/domain-training/domains/owner-workload";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("load", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("load", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("load", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("load", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<OwnerWorkloadInput>;
const HEAVY = "no owner-heavy action without a high-value/survival reason";
const ROUTINE = "no owner-only execution for routine tasks";
const APPROVE = "no funneling all approvals through the owner";
function c(id: string, st: Case["scenarioType"], a: string, input: OwnerWorkloadInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D9", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "owner", proofKeyword: "owner hours by task", verificationKeyword: "owner daily load", sideEffectMetrics: ["owner hours"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const DEL = "delegate", SUS = "sustainable";

export const OWNER_WORKLOAD_CASES: Case[] = [
  c("D9-01", "clean_normal", "universal", { dailyLoadPct: 0.6, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: SUS }),
  c("D9-02", "clean_normal", "universal", { dailyLoadPct: 0.7, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: SUS }),
  c("D9-03", "messy_real_world", "universal", { dailyLoadPct: 0.88, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-04", "messy_real_world", "universal", { dailyLoadPct: 1.05, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-05", "adversarial", "universal", { dailyLoadPct: 1.05, proposedOwnerHeavyAction: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [HEAVY], nextActionKeyword: DEL }, ["owner_overload"]),
  c("D9-06", "adversarial", "universal", { dailyLoadPct: 0.9, recurringFirefighting: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-07", "missing_data", "universal", { dailyLoadPct: 1.05, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-08", "missing_data", "universal", { dailyLoadPct: 0.88, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-09", "cross_pressure", "universal", { dailyLoadPct: 1.05, routineTaskOwnerOnly: true, approvalBottleneck: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ROUTINE, APPROVE], nextActionKeyword: DEL }),
  c("D9-10", "cross_pressure", "universal", { dailyLoadPct: 0.88, delegatableTasksPresent: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-11", "archetype_laundry", "laundry", { dailyLoadPct: 1.1, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-12", "archetype_laundry", "laundry", { dailyLoadPct: 0.6, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: SUS }),
  c("D9-13", "archetype_housekeeping", "housekeeping", { dailyLoadPct: 0.9, recurringFirefighting: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-14", "archetype_housekeeping", "housekeeping", { dailyLoadPct: 0.88, approvalBottleneck: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [APPROVE], nextActionKeyword: DEL }),
  c("D9-15", "owner_pressure", "universal", { dailyLoadPct: 1.05, proposedOwnerHeavyAction: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [HEAVY], nextActionKeyword: DEL }, ["owner_overload"]),
  c("D9-16", "owner_pressure", "universal", { dailyLoadPct: 1.05, proposedOwnerHeavyAction: true, survivalCritical: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-17", "false_completion", "universal", { dailyLoadPct: 1.05, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-18", "false_completion", "laundry", { dailyLoadPct: 0.88, routineTaskOwnerOnly: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [ROUTINE], nextActionKeyword: DEL }),
  c("D9-19", "vanity_metric", "universal", { dailyLoadPct: 1.1, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }, ["vanity_metric_optimization"]),
  c("D9-20", "adversarial", "housekeeping", { dailyLoadPct: 0.88, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: DEL }),
  c("D9-21", "missing_data", "universal", { dailyLoadPct: 1.05, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [], nextActionKeyword: DEL }),
];
