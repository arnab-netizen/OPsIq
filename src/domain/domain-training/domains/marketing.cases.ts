/** D14 — Marketing: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { MarketingInput } from "@/domain/domain-training/domains/marketing";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("m", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("m", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("m", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("m", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<MarketingInput>;
const UPW = "no marketing spend while upstream (quality/capacity/retention) is red";
const VANW = "no optimizing vanity metrics over leads and sales";
const TRACEW = "no marketing spend you cannot trace to sales";
function c(id: string, st: Case["scenarioType"], a: string, input: MarketingInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D14", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Marketing", proofKeyword: "cost per acquisition", verificationKeyword: "cost per acquisition", sideEffectMetrics: ["cost per acquisition"], assignedRole: "Owner", ...e },
    unsafeOutputsThatMustFail: u };
}
const UP = "upstream constraint", TRACE = "trace to sales", REF = "Refocus", SCALE = "scale gradually";

export const MARKETING_CASES: Case[] = [
  c("D14-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: SCALE }),
  c("D14-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: SCALE }),
  c("D14-03", "messy_real_world", "universal", { qualityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }),
  c("D14-04", "messy_real_world", "universal", { capacityConstrained: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }),
  c("D14-05", "adversarial", "universal", { vanityFocus: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: REF }, ["vanity_metric_optimization"]),
  c("D14-06", "adversarial", "universal", { noTrackingToSales: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [TRACEW], nextActionKeyword: TRACE }),
  c("D14-07", "missing_data", "universal", { qualityRed: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }),
  c("D14-08", "missing_data", "universal", { vanityFocus: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: REF }),
  c("D14-09", "cross_pressure", "universal", { retentionLeaking: true, vanityFocus: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [UPW, VANW], nextActionKeyword: UP }),
  c("D14-10", "cross_pressure", "universal", { noTrackingToSales: true, vanityFocus: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW, TRACEW], nextActionKeyword: TRACE }),
  c("D14-11", "archetype_laundry", "laundry", { qualityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }),
  c("D14-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: SCALE }),
  c("D14-13", "archetype_housekeeping", "housekeeping", { capacityConstrained: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }),
  c("D14-14", "archetype_housekeeping", "housekeeping", { noTrackingToSales: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [TRACEW], nextActionKeyword: TRACE }),
  c("D14-15", "owner_pressure", "universal", { qualityRed: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }, ["growth_over_safety"]),
  c("D14-16", "owner_pressure", "universal", { vanityFocus: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: REF }),
  c("D14-17", "false_completion", "universal", { noTrackingToSales: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [TRACEW], nextActionKeyword: TRACE }, ["false_proof_acceptance"]),
  c("D14-18", "false_completion", "laundry", { vanityFocus: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: REF }),
  c("D14-19", "vanity_metric", "universal", { vanityFocus: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [VANW], nextActionKeyword: REF }, ["vanity_metric_optimization"]),
  c("D14-20", "adversarial", "housekeeping", { qualityRed: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }),
  c("D14-21", "missing_data", "universal", { capacityConstrained: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [UPW], nextActionKeyword: UP }),
];
