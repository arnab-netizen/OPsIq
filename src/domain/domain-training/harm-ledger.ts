/**
 * F8 — Harm ledger shape + rules (pure).
 *
 * Records harms a decision/action may cause and enforces that a harmful side effect
 * prevents a success classification and raises future confidence/severity caution.
 * Integrates with the existing M24 harm-tracking persistence (workspace-scoped). Pure.
 */

import type { TrainingSeverity } from "@/domain/domain-training/training-types";
import { maxSeverity } from "@/domain/domain-training/severity-scoring";

export enum HarmType {
  CASH_WORSENED = "CASH_WORSENED",
  PROFIT_WORSENED = "PROFIT_WORSENED",
  COMPLAINTS_INCREASED = "COMPLAINTS_INCREASED",
  QUALITY_WORSENED = "QUALITY_WORSENED",
  STAFF_OVERLOAD_INCREASED = "STAFF_OVERLOAD_INCREASED",
  OWNER_WORKLOAD_INCREASED = "OWNER_WORKLOAD_INCREASED",
  RETENTION_DROPPED = "RETENTION_DROPPED",
  COMPLIANCE_RISK_CREATED = "COMPLIANCE_RISK_CREATED",
  CAPACITY_OVERLOAD_CREATED = "CAPACITY_OVERLOAD_CREATED",
  CUSTOMER_TRUST_DAMAGED = "CUSTOMER_TRUST_DAMAGED",
  SUPPLIER_RISK_INCREASED = "SUPPLIER_RISK_INCREASED",
  FALSE_COMPLETION_ACCEPTED = "FALSE_COMPLETION_ACCEPTED",
  UNVERIFIED_LEARNING_BLOCKED = "UNVERIFIED_LEARNING_BLOCKED",
}

export interface HarmEntry {
  workspaceId: string;
  harmType: HarmType;
  severity: TrainingSeverity;
  note: string;
}

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

export function validateHarmEntry(e: HarmEntry): string[] {
  const v: string[] = [];
  if (blank(e.workspaceId)) v.push("missing_workspace_id");
  if (!e.harmType) v.push("missing_harm_type");
  return v;
}

/** A harm at MEDIUM+ severity is a material side effect. */
export function isMaterialHarm(e: HarmEntry): boolean {
  return e.severity === "MEDIUM" || e.severity === "HIGH" || e.severity === "CRITICAL";
}

/**
 * Even when the primary metric improved, a material harm means the action is NOT a
 * success (it must be classified harmed/inconclusive, never positive learning).
 */
export function harmfulSideEffectPreventsSuccess(primaryImproved: boolean, harms: readonly HarmEntry[]): boolean {
  return harms.some(isMaterialHarm) ? true : !primaryImproved ? true : false;
}

/** Future caution: the worst recorded harm raises the minimum severity to assume. */
export function cautionSeverity(harms: readonly HarmEntry[]): TrainingSeverity {
  return harms.reduce<TrainingSeverity>((acc, h) => maxSeverity(acc, h.severity), "INFO");
}
