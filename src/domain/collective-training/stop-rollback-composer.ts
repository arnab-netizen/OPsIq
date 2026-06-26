/**
 * C12 — Stop/rollback/redesign composer (pure).
 *
 * Produces lever-specific stop, rollback, redesign and escalation conditions, including
 * the cross-domain side effects each lever must watch (e.g. a marketing action must
 * watch CAC, capacity, complaints and margin — not just leads).
 */

import type { StopRollbackRedesign } from "@/domain/collective-training/collective-types";

export type RollbackLever =
  | "marketing" | "pricing" | "supplier" | "sop" | "growth" | "cash" | "quality"
  | "capacity" | "retention" | "scale" | "generic";

const RULES: Record<RollbackLever, StopRollbackRedesign> = {
  marketing: {
    stopCondition: "stop if CAC exceeds contribution margin, or complaints/capacity load rise",
    rollbackCondition: "roll back the spend if margin falls or complaints increase",
    redesignCondition: "redesign the campaign if leads do not convert to profitable sales",
    escalationCondition: "escalate to owner if spend cannot be traced to sales",
  },
  pricing: {
    stopCondition: "stop if repeat rate, conversion, or margin deteriorate",
    rollbackCondition: "roll back the price change if customer complaints or churn spike",
    redesignCondition: "redesign pricing if margin and retention cannot both hold",
    escalationCondition: "escalate to owner if key accounts are at risk",
  },
  supplier: {
    stopCondition: "stop if quality defects or stockouts appear",
    rollbackCondition: "roll back the supplier change if quality drops or cash is tied in overstock",
    redesignCondition: "redesign sourcing if defects/stockouts repeat",
    escalationCondition: "escalate to owner for single-supplier critical dependency",
  },
  sop: {
    stopCondition: "stop scaling if adherence or outcome fails on the next jobs",
    rollbackCondition: "revert to the prior process if the new SOP underperforms",
    redesignCondition: "redesign the SOP after repeated failure",
    escalationCondition: "escalate to operations lead if the SOP keeps failing",
  },
  growth: {
    stopCondition: "stop growth if quality, capacity, or cash deteriorate",
    rollbackCondition: "roll back growth spend if unit economics turn negative",
    redesignCondition: "redesign the growth plan if a readiness gate fails",
    escalationCondition: "escalate to owner before any irreversible growth commitment",
  },
  cash: {
    stopCondition: "stop all discretionary spend if cash falls further",
    rollbackCondition: "reverse any commitment that worsens runway",
    redesignCondition: "redesign the cash plan if collections fail twice",
    escalationCondition: "escalate to accountant on insolvency risk",
  },
  quality: {
    stopCondition: "stop marketing/scaling while quality is red",
    rollbackCondition: "roll back the change that worsened defects",
    redesignCondition: "redesign the process if defects persist after the fix",
    escalationCondition: "escalate to operations lead on reputation risk",
  },
  capacity: {
    stopCondition: "stop intake if utilization exceeds safe headroom",
    rollbackCondition: "cap or reverse demand commitments that overload capacity",
    redesignCondition: "redesign capacity if overload repeats",
    escalationCondition: "escalate to owner for structural capacity investment",
  },
  retention: {
    stopCondition: "stop acquisition spend while churn is severe",
    rollbackCondition: "roll back changes that increased churn",
    redesignCondition: "redesign the retention approach if the leak persists",
    escalationCondition: "escalate to owner if a key segment churns",
  },
  scale: {
    stopCondition: "stop scaling if SOP/quality/owner-independence weakens",
    rollbackCondition: "roll back added volume/locations if margin breaks at scale",
    redesignCondition: "redesign the operating model if scale breaks the process",
    escalationCondition: "escalate to owner before adding volume or locations",
  },
  generic: {
    stopCondition: "stop if the success metric worsens or a side-effect metric deteriorates",
    rollbackCondition: "roll back if the change causes net harm",
    redesignCondition: "redesign if the action fails twice",
    escalationCondition: "escalate to owner if blocked or out of scope",
  },
};

export function composeStopRollbackRedesign(lever: RollbackLever): StopRollbackRedesign {
  return RULES[lever];
}
