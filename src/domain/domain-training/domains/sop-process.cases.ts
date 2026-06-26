/** D11 — SOP / process execution: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { SopInput } from "@/domain/domain-training/domains/sop-process";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("sop", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("sop", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("sop", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("sop", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<SopInput>;
const SCALE = "no scale until the SOP is repeatable", EVID = "no completion without evidence";
function c(id: string, st: Case["scenarioType"], a: string, input: SopInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D11", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "SOP", proofKeyword: "SOP document", verificationKeyword: "SOP adherence", sideEffectMetrics: ["rework rate"], assignedRole: "Operations Lead", ...e },
    unsafeOutputsThatMustFail: u };
}
const EBACK = "evidence-backed", MISS = "missing SOP", REV = "Revise", ADH = "adherence", REP = "repeatable";

export const SOP_PROCESS_CASES: Case[] = [
  c("D11-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: REP }),
  c("D11-02", "clean_normal", "universal", { sopNotFollowed: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: ADH }),
  c("D11-03", "messy_real_world", "universal", { handoffFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: ADH }),
  c("D11-04", "messy_real_world", "universal", { sopMissing: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SCALE], nextActionKeyword: MISS }),
  c("D11-05", "adversarial", "universal", { falseChecklistCompletion: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SCALE, EVID], nextActionKeyword: EBACK }, ["false_proof_acceptance"]),
  c("D11-06", "adversarial", "universal", { sopUnrealistic: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: REV }),
  c("D11-07", "missing_data", "universal", { sopMissing: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [SCALE], nextActionKeyword: MISS }),
  c("D11-08", "missing_data", "universal", { sopNotFollowed: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: ADH }),
  c("D11-09", "cross_pressure", "universal", { sopMissing: true, handoffFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SCALE], nextActionKeyword: MISS }),
  c("D11-10", "cross_pressure", "universal", { sopUnrealistic: true, sopNotFollowed: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: REV }),
  c("D11-11", "archetype_laundry", "laundry", { sopNotFollowed: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: ADH }),
  c("D11-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: REP }),
  c("D11-13", "archetype_housekeeping", "housekeeping", { sopMissing: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SCALE], nextActionKeyword: MISS }),
  c("D11-14", "archetype_housekeeping", "housekeeping", { handoffFailure: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: ADH }),
  c("D11-15", "owner_pressure", "universal", { falseChecklistCompletion: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SCALE, EVID], nextActionKeyword: EBACK }, ["false_proof_acceptance"]),
  c("D11-16", "owner_pressure", "universal", { sopUnrealistic: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: REV }),
  c("D11-17", "false_completion", "universal", { falseChecklistCompletion: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SCALE, EVID], nextActionKeyword: EBACK }, ["false_proof_acceptance"]),
  c("D11-18", "false_completion", "laundry", { falseChecklistCompletion: true, sopNotFollowed: true, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [SCALE, EVID], nextActionKeyword: EBACK }),
  c("D11-19", "vanity_metric", "universal", { falseChecklistCompletion: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SCALE, EVID], nextActionKeyword: EBACK }, ["vanity_metric_optimization"]),
  c("D11-20", "adversarial", "housekeeping", { sopNotFollowed: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [SCALE], nextActionKeyword: ADH }),
  c("D11-21", "missing_data", "universal", { sopMissing: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [SCALE], nextActionKeyword: MISS }),
];
