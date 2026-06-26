/** D18 — What not to do: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { WhatNotToDoInput } from "@/domain/domain-training/domains/what-not-to-do";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("w", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("w", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("w", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("w", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<WhatNotToDoInput>;
const CASHW = "no discretionary spend or growth while cash is red";
const QUALW = "no marketing or scaling while quality is red";
const CAPW = "no taking on more work while capacity is red";
const SCALEW = "no scaling before the readiness gates pass";
const DISCW = "no discounting without a contribution-margin check";
function c(id: string, st: Case["scenarioType"], a: string, input: WhatNotToDoInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D18", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "prohibited", proofKeyword: "cash, quality, and capacity", verificationKeyword: "prohibited actions", sideEffectMetrics: ["prohibited-action incidents"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const CASH = "fix cash first", QUAL = "Fix quality before", CAP = "capacity constraint", GATE = "readiness gates", MARGIN = "contribution-margin", GUARD = "guardrails";

export const WHAT_NOT_TO_DO_CASES: Case[] = [
  c("D18-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: GUARD }),
  c("D18-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: GUARD }),
  c("D18-03", "messy_real_world", "universal", { cashRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D18-04", "messy_real_world", "universal", { qualityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [QUALW], nextActionKeyword: QUAL }),
  c("D18-05", "adversarial", "universal", { cashRed: true, ownerWantsToScale: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW, SCALEW], nextActionKeyword: CASH }, ["growth_over_safety"]),
  c("D18-06", "adversarial", "universal", { ownerWantsDiscount: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [DISCW], nextActionKeyword: MARGIN }),
  c("D18-07", "missing_data", "universal", { cashRed: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D18-08", "missing_data", "universal", { ownerWantsToScale: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [SCALEW], nextActionKeyword: GATE }),
  c("D18-09", "cross_pressure", "universal", { qualityRed: true, capacityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [QUALW, CAPW], nextActionKeyword: QUAL }),
  c("D18-10", "cross_pressure", "universal", { ownerWantsToScale: true, ownerWantsDiscount: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALEW, DISCW], nextActionKeyword: GATE }),
  c("D18-11", "archetype_laundry", "laundry", { cashRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D18-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: GUARD }),
  c("D18-13", "archetype_housekeeping", "housekeeping", { capacityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CAPW], nextActionKeyword: CAP }),
  c("D18-14", "archetype_housekeeping", "housekeeping", { ownerWantsDiscount: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [DISCW], nextActionKeyword: MARGIN }),
  c("D18-15", "owner_pressure", "universal", { cashRed: true, ownerWantsToScale: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [CASHW, SCALEW], nextActionKeyword: CASH }, ["growth_over_safety"]),
  c("D18-16", "owner_pressure", "universal", { ownerWantsToScale: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALEW], nextActionKeyword: GATE }),
  c("D18-17", "false_completion", "universal", { qualityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [QUALW], nextActionKeyword: QUAL }, ["false_proof_acceptance"]),
  c("D18-18", "false_completion", "laundry", { ownerWantsDiscount: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [DISCW], nextActionKeyword: MARGIN }),
  c("D18-19", "vanity_metric", "universal", { ownerWantsToScale: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [SCALEW], nextActionKeyword: GATE }, ["vanity_metric_optimization"]),
  c("D18-20", "adversarial", "housekeeping", { cashRed: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [CASHW], nextActionKeyword: CASH }),
  c("D18-21", "missing_data", "universal", { capacityRed: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [CAPW], nextActionKeyword: CAP }),
];
