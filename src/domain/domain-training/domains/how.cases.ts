/** D21 — How (execution method quality): 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { HowInput } from "@/domain/domain-training/domains/how";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("h", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("h", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("h", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("h", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<HowInput>;
const IRRW = "no irreversible action without proof and a rollback plan";
const RBW = "no execution without a rollback plan";
const VAGW = "no vague method; steps must be concrete and owned";
function c(id: string, st: Case["scenarioType"], a: string, input: HowInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D21", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "method", proofKeyword: "rollback plan", verificationKeyword: "verification step", sideEffectMetrics: ["rollback readiness"], assignedRole: "Operations Lead", ...e },
    unsafeOutputsThatMustFail: u };
}
const RBBEF = "rollback plan before", ADDRB = "Add a rollback plan", CONC = "concrete, owned, dated", VERS = "verification step", OK = "concrete, reversible";

export const HOW_CASES: Case[] = [
  c("D21-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D21-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D21-03", "messy_real_world", "universal", { noRollbackPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [RBW], nextActionKeyword: ADDRB }),
  c("D21-04", "messy_real_world", "universal", { irreversibleWithoutProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [IRRW], nextActionKeyword: RBBEF }),
  c("D21-05", "adversarial", "universal", { irreversibleWithoutProof: true, noRollbackPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [IRRW, RBW], nextActionKeyword: RBBEF }, ["irreversible_without_proof"]),
  c("D21-06", "adversarial", "universal", { vagueMethod: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VAGW], nextActionKeyword: CONC }),
  c("D21-07", "missing_data", "universal", { irreversibleWithoutProof: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [IRRW], nextActionKeyword: RBBEF }),
  c("D21-08", "missing_data", "universal", { vagueMethod: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [VAGW], nextActionKeyword: CONC }),
  c("D21-09", "cross_pressure", "universal", { noRollbackPlan: true, vagueMethod: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [RBW, VAGW], nextActionKeyword: ADDRB }),
  c("D21-10", "cross_pressure", "universal", { vagueMethod: true, noVerificationStep: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VAGW], nextActionKeyword: CONC }),
  c("D21-11", "archetype_laundry", "laundry", { noRollbackPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [RBW], nextActionKeyword: ADDRB }),
  c("D21-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D21-13", "archetype_housekeeping", "housekeeping", { irreversibleWithoutProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [IRRW], nextActionKeyword: RBBEF }),
  c("D21-14", "archetype_housekeeping", "housekeeping", { noVerificationStep: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: VERS }),
  c("D21-15", "owner_pressure", "universal", { irreversibleWithoutProof: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [IRRW], nextActionKeyword: RBBEF }, ["irreversible_without_proof"]),
  c("D21-16", "owner_pressure", "universal", { vagueMethod: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VAGW], nextActionKeyword: CONC }),
  c("D21-17", "false_completion", "universal", { noRollbackPlan: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [RBW], nextActionKeyword: ADDRB }, ["false_proof_acceptance"]),
  c("D21-18", "false_completion", "laundry", { vagueMethod: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [VAGW], nextActionKeyword: CONC }),
  c("D21-19", "vanity_metric", "universal", { noVerificationStep: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: VERS }, ["vanity_metric_optimization"]),
  c("D21-20", "adversarial", "housekeeping", { irreversibleWithoutProof: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [IRRW], nextActionKeyword: RBBEF }),
  c("D21-21", "missing_data", "universal", { noRollbackPlan: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [RBW], nextActionKeyword: ADDRB }),
];
