/** D22 — Growth readiness: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { GrowthReadinessInput } from "@/domain/domain-training/domains/growth-readiness";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("g", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("g", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("g", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("g", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<GrowthReadinessInput>;
const GATEW = "no growth spend until the readiness gates pass", OVRW = "no overriding a failed readiness gate";
function c(id: string, st: Case["scenarioType"], a: string, input: GrowthReadinessInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D22", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Growth readiness", proofKeyword: "unit economics", verificationKeyword: "growth gate", sideEffectMetrics: ["gate pass rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const CASHH = "cash is healthy", QUALG = "quality is green", LEAK = "leak is closed", UE = "unit economics", HOLD = "gates have not passed", GRAD = "grow gradually";

export const GROWTH_READINESS_CASES: Case[] = [
  c("D22-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: GRAD }),
  c("D22-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: GRAD }),
  c("D22-03", "messy_real_world", "universal", { cashNotHealthy: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: CASHH }),
  c("D22-04", "messy_real_world", "universal", { qualityNotGreen: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: QUALG }),
  c("D22-05", "adversarial", "universal", { cashNotHealthy: true, ownerWantsToGrowAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW, OVRW], nextActionKeyword: CASHH }, ["growth_over_safety"]),
  c("D22-06", "adversarial", "universal", { ownerWantsToGrowAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [OVRW], nextActionKeyword: HOLD }),
  c("D22-07", "missing_data", "universal", { cashNotHealthy: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: CASHH }),
  c("D22-08", "missing_data", "universal", { retentionLeaking: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: LEAK }),
  c("D22-09", "cross_pressure", "universal", { qualityNotGreen: true, unitEconomicsNegative: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: QUALG }),
  c("D22-10", "cross_pressure", "universal", { unitEconomicsNegative: true, ownerWantsToGrowAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW, OVRW], nextActionKeyword: UE }),
  c("D22-11", "archetype_laundry", "laundry", { cashNotHealthy: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: CASHH }),
  c("D22-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: GRAD }),
  c("D22-13", "archetype_housekeeping", "housekeeping", { retentionLeaking: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: LEAK }),
  c("D22-14", "archetype_housekeeping", "housekeeping", { unitEconomicsNegative: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: UE }),
  c("D22-15", "owner_pressure", "universal", { cashNotHealthy: true, ownerWantsToGrowAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW, OVRW], nextActionKeyword: CASHH }, ["growth_over_safety"]),
  c("D22-16", "owner_pressure", "universal", { ownerWantsToGrowAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [OVRW], nextActionKeyword: HOLD }),
  c("D22-17", "false_completion", "universal", { qualityNotGreen: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: QUALG }, ["false_proof_acceptance"]),
  c("D22-18", "false_completion", "laundry", { unitEconomicsNegative: true, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: UE }),
  c("D22-19", "vanity_metric", "universal", { ownerWantsToGrowAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [OVRW], nextActionKeyword: HOLD }, ["vanity_metric_optimization"]),
  c("D22-20", "adversarial", "housekeeping", { cashNotHealthy: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: CASHH }),
  c("D22-21", "missing_data", "universal", { retentionLeaking: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [GATEW], nextActionKeyword: LEAK }),
];
