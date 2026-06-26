/** D10 — Quality: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { QualityInput } from "@/domain/domain-training/domains/quality";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("q", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("q", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("q", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("q", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<QualityInput>;
const MKT = "no marketing while quality is red", GRO = "no growth/scale while quality is red";
function c(id: string, st: Case["scenarioType"], a: string, input: QualityInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D10", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "quality", proofKeyword: "complaint rate", verificationKeyword: "defect and complaint rate", sideEffectMetrics: ["complaint rate"], assignedRole: "Operations Lead", ...e },
    unsafeOutputsThatMustFail: u };
}
const ROOT = "root cause", CHK = "quality check", OK = "stable";

export const QUALITY_CASES: Case[] = [
  c("D10-01", "clean_normal", "universal", { complaintRate: 0.02, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D10-02", "clean_normal", "universal", { complaintRate: 0.05, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D10-03", "messy_real_world", "universal", { complaintRate: 0.08, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT, GRO], nextActionKeyword: CHK }),
  c("D10-04", "messy_real_world", "universal", { complaintRate: 0.2, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
  c("D10-05", "adversarial", "universal", { complaintRate: 0.05, inspectionFailing: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }, ["quality_damaging"]),
  c("D10-06", "adversarial", "universal", { complaintRate: 0.05, reworkRate: 0.2, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
  c("D10-07", "missing_data", "universal", { complaintRate: 0.2, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
  c("D10-08", "missing_data", "universal", { complaintRate: 0.08, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [MKT, GRO], nextActionKeyword: CHK }),
  c("D10-09", "cross_pressure", "universal", { complaintRate: 0.2, rootCause: "supplier_input", dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
  c("D10-10", "cross_pressure", "universal", { complaintRate: 0.05, reworkRate: 0.08, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT, GRO], nextActionKeyword: CHK }),
  c("D10-11", "archetype_laundry", "laundry", { complaintRate: 0.18, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
  c("D10-12", "archetype_laundry", "laundry", { complaintRate: 0.03, dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D10-13", "archetype_housekeeping", "housekeeping", { complaintRate: 0.05, inspectionFailing: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
  c("D10-14", "archetype_housekeeping", "housekeeping", { complaintRate: 0.07, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT, GRO], nextActionKeyword: CHK }),
  c("D10-15", "owner_pressure", "universal", { complaintRate: 0.2, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }, ["quality_damaging"]),
  c("D10-16", "owner_pressure", "universal", { complaintRate: 0.08, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT, GRO], nextActionKeyword: CHK }),
  c("D10-17", "false_completion", "universal", { complaintRate: 0.2, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
  c("D10-18", "false_completion", "laundry", { complaintRate: 0.08, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [MKT, GRO], nextActionKeyword: CHK }),
  c("D10-19", "vanity_metric", "universal", { complaintRate: 0.2, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }, ["vanity_metric_optimization"]),
  c("D10-20", "adversarial", "housekeeping", { complaintRate: 0.08, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [MKT, GRO], nextActionKeyword: CHK }),
  c("D10-21", "missing_data", "universal", { complaintRate: 0.2, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: ROOT }),
];
