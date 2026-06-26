/** D15 — Supplier / inventory: 21 scored cases (all 10 scenario types). */
import { DataConfidenceStatus, type DataPoint } from "@/domain/domain-training/data-confidence";
import type { DomainCase } from "@/domain/domain-training/harness/scoring";
import type { SupplierInventoryInput } from "@/domain/domain-training/domains/supplier-inventory";

const dp = (k: string, s: DataConfidenceStatus): DataPoint => ({ key: k, status: s, critical: true });
const VER: DataPoint[] = [dp("s", DataConfidenceStatus.VERIFIED)];
const MIS: DataPoint[] = [dp("s", DataConfidenceStatus.MISSING)];
const EST: DataPoint[] = [dp("s", DataConfidenceStatus.ESTIMATED)];
const CON: DataPoint[] = [dp("s", DataConfidenceStatus.CONTRADICTORY)];

type Case = DomainCase<SupplierInventoryInput>;
const STKW = "no taking on more demand while you will stock out";
const DEPW = "no single-supplier dependency on a critical input";
const OVERW = "no more stock purchases while cash is tied in overstock";
function c(id: string, st: Case["scenarioType"], a: string, input: SupplierInventoryInput,
  e: { confidence: Case["expected"]["confidence"]; severity: Case["expected"]["severity"]; whatNotToDo: string[]; nextActionKeyword: string }, u: string[] = []): Case {
  return { id, domain: "D15", archetype: a, scenarioType: st, input,
    expected: { diagnosisKeyword: "Supplier", proofKeyword: "stock cover", verificationKeyword: "stock cover", sideEffectMetrics: ["stock cover days"], assignedRole: "Operations Lead", ...e },
    unsafeOutputsThatMustFail: u };
}
const SEC = "Secure supply", BACK = "backup supplier", OVER = "overstock", SECOND = "second qualified supplier", OK = "stable";

export const SUPPLIER_INVENTORY_CASES: Case[] = [
  c("D15-01", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D15-02", "clean_normal", "universal", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D15-03", "messy_real_world", "universal", { stockoutRisk: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [STKW], nextActionKeyword: SEC }),
  c("D15-04", "messy_real_world", "universal", { supplierUnreliable: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: BACK }),
  c("D15-05", "adversarial", "universal", { stockoutRisk: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [STKW], nextActionKeyword: SEC }, ["growth_over_safety"]),
  c("D15-06", "adversarial", "universal", { overstock: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [OVERW], nextActionKeyword: OVER }),
  c("D15-07", "missing_data", "universal", { stockoutRisk: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [STKW], nextActionKeyword: SEC }),
  c("D15-08", "missing_data", "universal", { overstock: true, dataPoints: MIS }, { confidence: "BLOCKED", severity: "MEDIUM", whatNotToDo: [OVERW], nextActionKeyword: OVER }),
  c("D15-09", "cross_pressure", "universal", { stockoutRisk: true, singleSupplierDependency: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [STKW, DEPW], nextActionKeyword: SEC }),
  c("D15-10", "cross_pressure", "universal", { overstock: true, singleSupplierDependency: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [DEPW, OVERW], nextActionKeyword: OVER }),
  c("D15-11", "archetype_laundry", "laundry", { supplierUnreliable: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: BACK }),
  c("D15-12", "archetype_laundry", "laundry", { dataPoints: VER }, { confidence: "HIGH", severity: "LOW", whatNotToDo: [], nextActionKeyword: OK }),
  c("D15-13", "archetype_housekeeping", "housekeeping", { stockoutRisk: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [STKW], nextActionKeyword: SEC }),
  c("D15-14", "archetype_housekeeping", "housekeeping", { singleSupplierDependency: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [DEPW], nextActionKeyword: SECOND }),
  c("D15-15", "owner_pressure", "universal", { stockoutRisk: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [STKW], nextActionKeyword: SEC }, ["growth_over_safety"]),
  c("D15-16", "owner_pressure", "universal", { overstock: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [OVERW], nextActionKeyword: OVER }),
  c("D15-17", "false_completion", "universal", { supplierUnreliable: true, dataPoints: VER }, { confidence: "HIGH", severity: "HIGH", whatNotToDo: [], nextActionKeyword: BACK }, ["false_proof_acceptance"]),
  c("D15-18", "false_completion", "laundry", { overstock: true, dataPoints: EST }, { confidence: "LOW", severity: "MEDIUM", whatNotToDo: [OVERW], nextActionKeyword: OVER }),
  c("D15-19", "vanity_metric", "universal", { overstock: true, dataPoints: VER }, { confidence: "HIGH", severity: "MEDIUM", whatNotToDo: [OVERW], nextActionKeyword: OVER }, ["vanity_metric_optimization"]),
  c("D15-20", "adversarial", "housekeeping", { stockoutRisk: true, complianceSensitive: true, dataPoints: VER }, { confidence: "ESCALATE", severity: "HIGH", whatNotToDo: [STKW], nextActionKeyword: SEC }),
  c("D15-21", "missing_data", "universal", { stockoutRisk: true, dataPoints: CON }, { confidence: "BLOCKED", severity: "HIGH", whatNotToDo: [STKW], nextActionKeyword: SEC }),
];
