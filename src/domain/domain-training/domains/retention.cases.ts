/** D13 — Customer retention: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { RetentionInput } from "@/domain/domain-training/domains/retention";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("r", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("r", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("r", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("r", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<RetentionInput>;
const ACQ = "no acquisition spend while retention is leaking", BUCKET = "no scaling on top of a leaky bucket";
function c(id: string, st: Case["scenarioType"], a: string, input: RetentionInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D13", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Retention", proofKeyword: "churn rate", verificationKeyword: "churn and repeat rate", sideEffectMetrics: ["churn rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const LEAK = "retention leak", TRACK = "retention tracking", TIGHT = "Tighten retention", OK = "stable";

export const RETENTION_CASES: Case[] = [
  c("D13-01", "clean_normal", "universal", { churnRate: 0.03, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D13-02", "clean_normal", "universal", { churnRate: 0.05, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D13-03", "messy_real_world", "universal", { churnRate: 0.12, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TIGHT }),
  c("D13-04", "messy_real_world", "universal", { churnRate: 0.25, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }),
  c("D13-05", "adversarial", "universal", { churnRate: 0.3, ownerWantsAcquisitionSpend: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }, ["growth_over_safety"]),
  c("D13-06", "adversarial", "universal", { churnRate: 0.05, noRetentionTracking: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TRACK }),
  c("D13-07", "missing_data", "universal", { churnRate: 0.25, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }),
  c("D13-08", "missing_data", "universal", { churnRate: 0.12, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TIGHT }),
  c("D13-09", "cross_pressure", "universal", { churnRate: 0.25, ownerWantsAcquisitionSpend: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }),
  c("D13-10", "cross_pressure", "universal", { churnRate: 0.12, noRetentionTracking: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TRACK }),
  c("D13-11", "archetype_laundry", "laundry", { churnRate: 0.22, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }),
  c("D13-12", "archetype_laundry", "laundry", { churnRate: 0.04, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D13-13", "archetype_housekeeping", "housekeeping", { churnRate: 0.3, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }),
  c("D13-14", "archetype_housekeeping", "housekeeping", { churnRate: 0.12, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TIGHT }),
  c("D13-15", "owner_pressure", "universal", { churnRate: 0.25, ownerWantsAcquisitionSpend: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }, ["growth_over_safety"]),
  c("D13-16", "owner_pressure", "universal", { churnRate: 0.12, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TIGHT }),
  c("D13-17", "false_completion", "universal", { churnRate: 0.25, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }),
  c("D13-18", "false_completion", "laundry", { churnRate: 0.12, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TIGHT }),
  c("D13-19", "vanity_metric", "universal", { churnRate: 0.25, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }, ["vanity_metric_optimization"]),
  c("D13-20", "adversarial", "housekeeping", { churnRate: 0.12, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: TIGHT }),
  c("D13-21", "missing_data", "universal", { churnRate: 0.25, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [ACQ, BUCKET], nextActionKeyword: LEAK }),
];
