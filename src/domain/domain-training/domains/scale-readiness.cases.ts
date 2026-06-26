/** D23 — Scale readiness: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { ScaleReadinessInput } from "@/domain/domain-training/domains/scale-readiness";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("sc", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("sc", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("sc", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("sc", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<ScaleReadinessInput>;
const SGATEW = "no scaling until the operation is repeatable without the owner", SOVRW = "no overriding a failed scale gate";
function c(id: string, st: Case["scenarioType"], a: string, input: ScaleReadinessInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D23", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Scale readiness", proofKeyword: "margin at scale", verificationKeyword: "scale gate", sideEffectMetrics: ["scale gate pass rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const REPB = "repeatable before scaling", OWNDEP = "owner dependency", SYS = "systems in place", MARG = "unit margin", SHOLD = "scale gates have not passed", STEPS = "controlled steps";

export const SCALE_READINESS_CASES: Case[] = [
  c("D23-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: STEPS }),
  c("D23-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: STEPS }),
  c("D23-03", "messy_real_world", "universal", { sopsNotRepeatable: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: REPB }),
  c("D23-04", "messy_real_world", "universal", { ownerDependent: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: OWNDEP }),
  c("D23-05", "adversarial", "universal", { sopsNotRepeatable: true, ownerWantsToScaleAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW, SOVRW], nextActionKeyword: REPB }, ["growth_over_safety"]),
  c("D23-06", "adversarial", "universal", { ownerWantsToScaleAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SOVRW], nextActionKeyword: SHOLD }),
  c("D23-07", "missing_data", "universal", { sopsNotRepeatable: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: REPB }),
  c("D23-08", "missing_data", "universal", { systemsNotInPlace: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: SYS }),
  c("D23-09", "cross_pressure", "universal", { ownerDependent: true, marginBreaksAtScale: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: OWNDEP }),
  c("D23-10", "cross_pressure", "universal", { marginBreaksAtScale: true, ownerWantsToScaleAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW, SOVRW], nextActionKeyword: MARG }),
  c("D23-11", "archetype_laundry", "laundry", { sopsNotRepeatable: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: REPB }),
  c("D23-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: STEPS }),
  c("D23-13", "archetype_housekeeping", "housekeeping", { systemsNotInPlace: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: SYS }),
  c("D23-14", "archetype_housekeeping", "housekeeping", { marginBreaksAtScale: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: MARG }),
  c("D23-15", "owner_pressure", "universal", { ownerDependent: true, ownerWantsToScaleAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW, SOVRW], nextActionKeyword: OWNDEP }, ["owner_bottleneck"]),
  c("D23-16", "owner_pressure", "universal", { ownerWantsToScaleAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SOVRW], nextActionKeyword: SHOLD }),
  c("D23-17", "false_completion", "universal", { sopsNotRepeatable: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: REPB }, ["false_proof_acceptance"]),
  c("D23-18", "false_completion", "laundry", { marginBreaksAtScale: true, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: MARG }),
  c("D23-19", "vanity_metric", "universal", { ownerWantsToScaleAnyway: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SOVRW], nextActionKeyword: SHOLD }, ["vanity_metric_optimization"]),
  c("D23-20", "adversarial", "housekeeping", { sopsNotRepeatable: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: REPB }),
  c("D23-21", "missing_data", "universal", { systemsNotInPlace: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [SGATEW], nextActionKeyword: SYS }),
];
