/** D19 — What to do next: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { WhatToDoNextInput } from "@/domain/domain-training/domains/what-to-do-next";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("n", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("n", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("n", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("n", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<WhatToDoNextInput>;
const CASHW = "no other work before cash is stabilized", GROWW = "no jumping to growth before survival and stability are secured";
function c(id: string, st: Case["scenarioType"], a: string, input: WhatToDoNextInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D19", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Next action", proofKeyword: "next action", verificationKeyword: "next action was executed", sideEffectMetrics: ["next-action completion rate"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const CASH = "cash-survival action next", QUAL = "quality fix next", CAP = "capacity fix next", PROF = "profit action next", GATE = "readiness gates first", DEF = "single next action", EXEC = "execute it";

export const WHAT_TO_DO_NEXT_CASES: Case[] = [
  c("D19-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: EXEC }),
  c("D19-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: EXEC }),
  c("D19-03", "messy_real_world", "universal", { cashRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D19-04", "messy_real_world", "universal", { qualityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: QUAL }),
  c("D19-05", "adversarial", "universal", { cashRed: true, ownerWantsGrowthFirst: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW, GROWW], nextActionKeyword: CASH }, ["growth_over_safety"]),
  c("D19-06", "adversarial", "universal", { ownerWantsGrowthFirst: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [GROWW], nextActionKeyword: GATE }),
  c("D19-07", "missing_data", "universal", { cashRed: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D19-08", "missing_data", "universal", { profitWeak: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: PROF }),
  c("D19-09", "cross_pressure", "universal", { qualityRed: true, capacityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: QUAL }),
  c("D19-10", "cross_pressure", "universal", { profitWeak: true, ownerWantsGrowthFirst: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [GROWW], nextActionKeyword: PROF }),
  c("D19-11", "archetype_laundry", "laundry", { cashRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D19-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: EXEC }),
  c("D19-13", "archetype_housekeeping", "housekeeping", { capacityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: CAP }),
  c("D19-14", "archetype_housekeeping", "housekeeping", { noNextActionDefined: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: DEF }),
  c("D19-15", "owner_pressure", "universal", { cashRed: true, ownerWantsGrowthFirst: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW, GROWW], nextActionKeyword: CASH }, ["growth_over_safety"]),
  c("D19-16", "owner_pressure", "universal", { ownerWantsGrowthFirst: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [GROWW], nextActionKeyword: GATE }),
  c("D19-17", "false_completion", "universal", { cashRed: true, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D19-18", "false_completion", "laundry", { profitWeak: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [], nextActionKeyword: PROF }),
  c("D19-19", "vanity_metric", "universal", { ownerWantsGrowthFirst: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [GROWW], nextActionKeyword: GATE }, ["vanity_metric_optimization"]),
  c("D19-20", "adversarial", "housekeeping", { cashRed: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D19-21", "missing_data", "universal", { capacityRed: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [], nextActionKeyword: CAP }),
];
