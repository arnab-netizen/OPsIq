/**
 * D15 — Supplier / inventory (responder, pure).
 * Detects stockout risk, unreliable supplier, overstock, single-supplier dependency;
 * blocks taking on demand while you will stock out and critical single-sourcing. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface SupplierInventoryInput {
  stockoutRisk?: boolean;
  supplierUnreliable?: boolean;
  overstock?: boolean;
  singleSupplierDependency?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondSupplierInventory(input: SupplierInventoryInput): DomainResponse {
  const critical = !!(input.stockoutRisk || input.supplierUnreliable);
  const severity: TrainingSeverity = critical ? "HIGH"
    : (input.overstock || input.singleSupplierDependency) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (input.stockoutRisk) wntd.push("no taking on more demand while you will stock out");
  if (input.singleSupplierDependency) wntd.push("no single-supplier dependency on a critical input");
  if (input.overstock) wntd.push("no more stock purchases while cash is tied in overstock");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.stockoutRisk) nextAction = "Secure supply for the at-risk input before promising more volume; recheck stock cover.";
  else if (input.supplierUnreliable) nextAction = "Qualify a backup supplier and hold safety stock; verify lead time and reliability.";
  else if (input.overstock) nextAction = "Run down the overstock and free the tied cash; right-size reorder points.";
  else if (input.singleSupplierDependency) nextAction = "Add a second qualified supplier for the critical input to remove the dependency.";
  else nextAction = "Supply and inventory are stable; protect reorder points and supplier terms.";

  return {
    diagnosis: `Supplier/inventory: ${critical ? "AT_RISK" : "stable"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Operations Lead",
    proofRequired: "stock cover days, supplier lead time and reliability, reorder points, and inventory holding cost",
    verificationMethod: "recheck stock cover and supplier reliability after the fix",
    sideEffectMetrics: ["stock cover days", "stockout rate", "inventory holding cost"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
