/**
 * C10 — Guided execution composer (pure).
 *
 * Composes concrete, sequenced how-to-do-it steps (with evidence capture, escalation
 * point, and common mistakes) for the chosen action's lever. Generic, non-executable
 * "improve X" instructions are rejected by `validateExecution`, which also requires an
 * evidence-capture step and (for high-risk actions) an escalation point.
 */

import { containsForbiddenGeneric } from "@/domain/owner-guidance/generic-output-guard";

export type ExecutionLever =
  | "cash" | "compliance" | "quality" | "capacity" | "supplier" | "workload"
  | "sop" | "complaints" | "profit" | "pricing" | "retention" | "marketing"
  | "growth" | "scale" | "proof" | "generic";

export interface ExecutionPlan {
  steps: string[];
  checklist: string[];
  escalationPoint: string;
  commonMistakes: string[];
}

const TEMPLATES: Record<ExecutionLever, ExecutionPlan> = {
  cash: {
    steps: ["List every overdue invoice with amount and age", "Call the largest/oldest debtors today and agree a pay date", "Pause all non-essential outflows", "Record each payment received as proof"],
    checklist: ["overdue list", "agreed pay dates", "frozen spend list", "bank-confirmed receipts"],
    escalationPoint: "accountant if collections stall or insolvency risk appears",
    commonMistakes: ["discounting just to collect", "chasing new revenue before securing owed cash"],
  },
  compliance: {
    steps: ["Identify the exact compliance/legal/tax/safety question", "Engage a verified expert for written sign-off", "Hold the action until sign-off is recorded", "File the sign-off as evidence"],
    checklist: ["question stated", "expert engaged", "written sign-off", "filed evidence"],
    escalationPoint: "verified legal/compliance/tax expert before acting",
    commonMistakes: ["acting on assumption", "treating speed as more important than compliance"],
  },
  quality: {
    steps: ["Pull the defect/complaint/rework data", "Trace the failing step to its root cause", "Fix the root cause and re-run the check", "Record the rechecked defect and complaint rate"],
    checklist: ["defect data", "root cause identified", "fix applied", "rechecked rate recorded"],
    escalationPoint: "operations lead if defects persist after the fix",
    commonMistakes: ["marketing while quality is red", "treating a symptom instead of the root cause"],
  },
  capacity: {
    steps: ["Measure current utilization vs demand", "Remove the bottleneck or cap intake", "Confirm headroom before accepting more", "Record the capacity measurement as proof"],
    checklist: ["utilization measured", "bottleneck addressed", "intake capped", "headroom confirmed"],
    escalationPoint: "owner if structural capacity investment is required",
    commonMistakes: ["promising volume you cannot deliver", "demand generation while red"],
  },
  supplier: {
    steps: ["Check stock cover and supplier reliability", "Secure the at-risk input or qualify a backup", "Right-size reorder points", "Record stock cover and lead time as proof"],
    checklist: ["stock cover", "backup supplier", "reorder points", "recorded evidence"],
    escalationPoint: "owner for single-supplier critical dependency",
    commonMistakes: ["taking demand while you will stock out", "cost-only supplier swaps that harm quality"],
  },
  workload: {
    steps: ["Map current tasks and load per person", "Remove waste and rebalance tasks", "Confirm load is within limits", "Record the rebalanced load"],
    checklist: ["task map", "waste removed", "rebalanced load", "recorded limits"],
    escalationPoint: "owner if sustained profitable demand justifies hiring",
    commonMistakes: ["adding demand onto an overloaded team", "owner absorbing all the overflow"],
  },
  sop: {
    steps: ["Write/clarify the SOP for the error-prone task", "Have staff follow it on the next jobs", "Verify adherence and outcome", "Record evidence-backed completion"],
    checklist: ["SOP written", "followed on next jobs", "adherence verified", "evidence-backed completion"],
    escalationPoint: "operations lead if the SOP keeps failing (redesign)",
    commonMistakes: ["scaling broken process", "accepting checklist completion without evidence"],
  },
  complaints: {
    steps: ["Review the complaint record and pattern", "Run the recovery action with the customer", "Collect closure proof and confirm acceptance", "Check for a repeat pattern"],
    checklist: ["complaint record", "recovery action", "customer confirmation", "pattern check"],
    escalationPoint: "owner if reputation risk is material",
    commonMistakes: ["closing without recovery proof", "treating a pattern as isolated"],
  },
  profit: {
    steps: ["Break down margin by product/customer/channel", "Find the leak (discounts, rework, low-margin work)", "Fix the leak and re-measure margin", "Record the margin evidence"],
    checklist: ["margin breakdown", "leak identified", "fix applied", "margin re-measured"],
    escalationPoint: "owner for repricing or exiting unprofitable accounts",
    commonMistakes: ["chasing revenue while margin leaks", "discounting below margin"],
  },
  pricing: {
    steps: ["Compute contribution margin at the proposed price", "Model retention/conversion impact", "Decide within margin protection", "Record the margin and impact evidence"],
    checklist: ["contribution margin", "retention model", "decision recorded", "evidence filed"],
    escalationPoint: "owner if the change risks key accounts",
    commonMistakes: ["discounting below margin", "raising price blind to retention risk"],
  },
  retention: {
    steps: ["Pull churn and repeat-purchase data", "Find why customers leave (price/value/service)", "Fix the leak then re-measure", "Record churn and repeat-rate evidence"],
    checklist: ["churn data", "reason-for-leaving", "fix applied", "re-measured"],
    escalationPoint: "owner if a key segment is churning",
    commonMistakes: ["acquisition spend on a leaky bucket", "assuming quality is fine"],
  },
  marketing: {
    steps: ["Instrument tracking from spend to leads to sales", "Confirm upstream (quality/capacity/retention) is green", "Scale spend gradually within CAC", "Record cost-per-acquisition evidence"],
    checklist: ["tracking instrumented", "upstream green", "gradual scale", "CAC recorded"],
    escalationPoint: "owner if CAC exceeds contribution margin",
    commonMistakes: ["spend while upstream is red", "optimizing vanity metrics over sales"],
  },
  growth: {
    steps: ["List the growth-readiness gates", "Collect proof for each failing gate", "Pass the gates, then grow gradually", "Record the gate evidence"],
    checklist: ["gates listed", "proof collected", "gates passed", "evidence recorded"],
    escalationPoint: "owner before any irreversible growth commitment",
    commonMistakes: ["growth before survival/stability", "overriding a failed gate"],
  },
  scale: {
    steps: ["List the scale-readiness gates (SOP, owner-independence, systems, margin)", "Collect proof for each", "Scale in controlled steps", "Record the gate evidence"],
    checklist: ["gates listed", "proof collected", "controlled steps", "evidence recorded"],
    escalationPoint: "owner before adding volume or locations",
    commonMistakes: ["scaling broken process", "owner-dependent scaling"],
  },
  proof: {
    steps: ["Identify the missing critical evidence", "Establish the baseline metric", "Collect verifiable evidence from a strong source", "Record it before any commitment"],
    checklist: ["missing evidence identified", "baseline set", "evidence collected", "recorded"],
    escalationPoint: "owner if evidence cannot be obtained",
    commonMistakes: ["acting on weak data", "treating action as proof of success"],
  },
  generic: {
    steps: ["Define the specific change with an owner and a date", "Execute the step", "Capture completion evidence", "Review against the success metric"],
    checklist: ["specific change", "owner+date", "evidence captured", "reviewed"],
    escalationPoint: "owner if the planned step conflicts with a constraint",
    commonMistakes: ["vague aspiration instead of a concrete step"],
  },
};

export function composeExecution(lever: ExecutionLever): ExecutionPlan {
  return TEMPLATES[lever];
}

export interface ExecutionValidationInput {
  plan: ExecutionPlan;
  highRisk: boolean;
}

/** Returns violations; empty = acceptable execution plan. */
export function validateExecution(i: ExecutionValidationInput): string[] {
  const v: string[] = [];
  const { plan } = i;
  if (!plan.steps || plan.steps.length < 2) v.push("not_sequenced");
  // Reject generic non-executable instructions.
  if (plan.steps.some((s) => containsForbiddenGeneric(s).length > 0)) v.push("generic_instruction");
  // Require an evidence-capture step.
  if (!plan.steps.some((s) => /record|evidence|proof|capture|confirm/i.test(s))) v.push("no_evidence_capture");
  // High-risk actions require an escalation point.
  if (i.highRisk && (typeof plan.escalationPoint !== "string" || plan.escalationPoint.trim().length === 0)) v.push("no_escalation_point");
  return v;
}
