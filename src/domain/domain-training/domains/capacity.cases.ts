/** D7 — Capacity: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { CapacityInput } from "@/domain/domain-training/domains/capacity";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("util", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("util", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("util", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("util", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<CapacityInput>;
const MKT = "no broad marketing while capacity is stressed";
const GRO = "no growth until backlog/turnaround/quality is safe";
function c(id: string, st: Case["scenarioType"], a: string, input: CapacityInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D7", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "capacity", proofKeyword: "utilization by resource", verificationKeyword: "bottleneck utilization", sideEffectMetrics: ["turnaround time"], assignedRole: "Operations Lead", ...e },
    unsafeOutputsThatMustFail: u };
}
const DEMAND = "safe demand limit", LIMIT = "safe limit", OK = "healthy";

export const CAPACITY_CASES: Case[] = [
  c("D7-01", "clean_normal", "universal", { utilizationPct: 0.5, bottleneckResource: "service", dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D7-02", "clean_normal", "universal", { utilizationPct: 0.7, bottleneckResource: "service", dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D7-03", "messy_real_world", "universal", { utilizationPct: 0.88, bottleneckResource: "delivery", dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT], nextActionKeyword: LIMIT }),
  c("D7-04", "messy_real_world", "universal", { utilizationPct: 0.96, bottleneckResource: "equipment", dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-05", "adversarial", "universal", { utilizationPct: 0.99, bottleneckResource: "equipment", dataPoints: VER }, { confidence: "HIGH", severity: "CRITICAL", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }, ["capacity_blind_growth"]),
  c("D7-06", "adversarial", "universal", { utilizationPct: 0.8, bottleneckResource: "staff", backlogRising: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-07", "missing_data", "universal", { utilizationPct: 0.96, bottleneckResource: "equipment", dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-08", "missing_data", "universal", { utilizationPct: 0.88, bottleneckResource: "delivery", dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [MKT], nextActionKeyword: LIMIT }),
  c("D7-09", "cross_pressure", "universal", { utilizationPct: 0.96, bottleneckResource: "service", qualityUnsafe: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-10", "cross_pressure", "universal", { utilizationPct: 0.88, bottleneckResource: "service", reworkDrain: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT, "no ignoring rework capacity drain"], nextActionKeyword: LIMIT }),
  c("D7-11", "archetype_laundry", "laundry", { utilizationPct: 0.97, bottleneckResource: "washer/dryer", dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-12", "archetype_laundry", "laundry", { utilizationPct: 0.6, bottleneckResource: "press", dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D7-13", "archetype_housekeeping", "housekeeping", { utilizationPct: 0.96, bottleneckResource: "staff", dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-14", "archetype_housekeeping", "housekeeping", { utilizationPct: 0.86, bottleneckResource: "supervisor", dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT], nextActionKeyword: LIMIT }),
  c("D7-15", "owner_pressure", "universal", { utilizationPct: 0.97, bottleneckResource: "service", dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }, ["capacity_blind_growth"]),
  c("D7-16", "owner_pressure", "universal", { utilizationPct: 0.88, bottleneckResource: "delivery", dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [MKT], nextActionKeyword: LIMIT }),
  c("D7-17", "false_completion", "universal", { utilizationPct: 0.96, bottleneckResource: "equipment", dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-18", "false_completion", "laundry", { utilizationPct: 0.8, bottleneckResource: "staff", backlogRising: true, dataPoints: EST }, { confidence: "LOW", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
  c("D7-19", "vanity_metric", "universal", { utilizationPct: 0.97, bottleneckResource: "service", dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }, ["vanity_metric_optimization"]),
  c("D7-20", "adversarial", "housekeeping", { utilizationPct: 0.88, bottleneckResource: "staff", complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "MEDIUM", whatNotToDo: [MKT], nextActionKeyword: LIMIT }),
  c("D7-21", "missing_data", "universal", { utilizationPct: 0.96, bottleneckResource: "equipment", dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [MKT, GRO], nextActionKeyword: DEMAND }),
];
