/** D20 — Who (delegation / accountable assignment): 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { WhoInput } from "@/domain/domain-training/domains/who";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("wh", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("wh", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("wh", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("wh", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<WhoInput>;
const BOTW = "no owner bottlenecking; delegate non-owner work";
const ACCW = "no action without a single accountable owner";
const KEYW = "no single-person dependency on a critical task";
function c(id: string, st: Case["scenarioType"], a: string, input: WhoInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D20", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Assignment", proofKeyword: "task owner", verificationKeyword: "assigned owner", sideEffectMetrics: ["unassigned task count"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const ACC = "accountable owner", DEL = "Delegate", CAP = "right capability", CROSS = "Cross-train", OK = "clear and accountable";

export const WHO_CASES: Case[] = [
  c("D20-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D20-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D20-03", "messy_real_world", "universal", { ownerDoingEverything: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [BOTW], nextActionKeyword: DEL }),
  c("D20-04", "messy_real_world", "universal", { noOwnerAssigned: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACCW], nextActionKeyword: ACC }),
  c("D20-05", "adversarial", "universal", { ownerDoingEverything: true, keyPersonDependency: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [BOTW, KEYW], nextActionKeyword: DEL }, ["owner_bottleneck"]),
  c("D20-06", "adversarial", "universal", { wrongSkillForTask: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: CAP }),
  c("D20-07", "missing_data", "universal", { noOwnerAssigned: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [ACCW], nextActionKeyword: ACC }),
  c("D20-08", "missing_data", "universal", { keyPersonDependency: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [KEYW], nextActionKeyword: CROSS }),
  c("D20-09", "cross_pressure", "universal", { noOwnerAssigned: true, wrongSkillForTask: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACCW], nextActionKeyword: ACC }),
  c("D20-10", "cross_pressure", "universal", { wrongSkillForTask: true, keyPersonDependency: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [KEYW], nextActionKeyword: CAP }),
  c("D20-11", "archetype_laundry", "laundry", { ownerDoingEverything: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [BOTW], nextActionKeyword: DEL }),
  c("D20-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D20-13", "archetype_housekeeping", "housekeeping", { noOwnerAssigned: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACCW], nextActionKeyword: ACC }),
  c("D20-14", "archetype_housekeeping", "housekeeping", { keyPersonDependency: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [KEYW], nextActionKeyword: CROSS }),
  c("D20-15", "owner_pressure", "universal", { ownerDoingEverything: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [BOTW], nextActionKeyword: DEL }, ["owner_bottleneck"]),
  c("D20-16", "owner_pressure", "universal", { wrongSkillForTask: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: CAP }),
  c("D20-17", "false_completion", "universal", { noOwnerAssigned: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [ACCW], nextActionKeyword: ACC }, ["false_proof_acceptance"]),
  c("D20-18", "false_completion", "laundry", { keyPersonDependency: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [KEYW], nextActionKeyword: CROSS }),
  c("D20-19", "vanity_metric", "universal", { wrongSkillForTask: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: CAP }, ["vanity_metric_optimization"]),
  c("D20-20", "adversarial", "housekeeping", { noOwnerAssigned: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [ACCW], nextActionKeyword: ACC }),
  c("D20-21", "missing_data", "universal", { ownerDoingEverything: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [BOTW], nextActionKeyword: DEL }),
];
