/**
 * Owner Strategy — Workload Execution Engine + Work Package Generator
 * (execution.md Phase 7, GAP-005 + GAP-006). Pure, deterministic, no I/O.
 *
 * Turns a recommendation into a complete Work Package: prepared artifacts, the
 * maximum SAFE workload-transfer level, assignee, deadline, proof rules, outcome
 * measurement, owner-workload transfer estimate, escalation, and learning hooks.
 * OpsIQ prepares/assigns the work — it does not stop at advice (Rule B#10, E).
 */

import type {
  WorkPackageInput,
  WorkPackage,
  WorkPackageActionKind,
  WorkloadTransferLevel,
  PreparedArtifact,
  AssigneeRole,
  FinancialDecision,
  OwnerWorkloadEstimate,
} from "./work-package.types";

// --- workload transfer level ----------------------------------------------

/** Roles that let OpsIQ create + assign + track a structured task (level 2). */
const ASSIGNABLE_ROLES: ReadonlySet<AssigneeRole> = new Set(["staff", "manager", "system", "vendor"]);

export function determineMaxTransferLevel(input: WorkPackageInput): { level: WorkloadTransferLevel; reason: string } {
  const safe = input.isSafe !== false;
  const legal = input.isLegal !== false;
  const authorized = input.withinAuthority !== false;
  if (!safe || !legal || !authorized) {
    const why = !legal ? "not lawful" : !safe ? "not safe" : "outside OpsIQ's authority";
    return { level: "LEVEL_5_BLOCKED", reason: `Blocked (${why}) — escalated to the owner, no automation.` };
  }
  if (input.financialDecision === "BLOCKED") {
    return { level: "LEVEL_5_BLOCKED", reason: "Financial governor blocked this action — not executed." };
  }
  const assignee = input.assigneeRole ?? "owner";
  if (ASSIGNABLE_ROLES.has(assignee)) {
    return {
      level: "LEVEL_2_STRUCTURED_TASK_EXECUTION",
      reason: `OpsIQ creates the task, assigns it to ${assignee}, sets the deadline, defines proof, and tracks completion.`,
    };
  }
  // Owner executes, but OpsIQ prepares the work.
  return {
    level: "LEVEL_1_PREPARED_WORK",
    reason: "OpsIQ prepares the scripts/checklists/trackers; the owner executes with the prepared work.",
  };
}

// --- prepared artifacts ----------------------------------------------------

function slot(businessName: string | null | undefined): string {
  return businessName && businessName.trim() !== "" ? businessName : "[business name]";
}

function artifactsFor(kind: WorkPackageActionKind, businessName: string | null | undefined): PreparedArtifact[] {
  const biz = slot(businessName);
  switch (kind) {
    case "customer_reactivation":
      return [
        {
          kind: "customer_script",
          title: "Dormant customer win-back message",
          content: `Hi [customer name], this is ${biz}. We've missed you! It's been a while since your last visit. As a thank-you for coming back, here's [offer]. Reply YES and we'll set it up. — ${biz}`,
        },
        {
          kind: "call_list",
          title: "Dormant customer call list",
          content: "Columns: Customer name | Last order date | Phone | Preferred contact | Offer sent (Y/N) | Response | Follow-up date | Result",
        },
        {
          kind: "tracker",
          title: "Reactivation outcome tracker",
          content: "Track: contacted count | responded count | returned count | revenue recovered. Review at the measurement window.",
        },
      ];
    case "complaint_recovery":
      return [
        {
          kind: "complaint_recovery",
          title: "Complaint recovery response",
          content: `Hi [customer name], I'm sorry about [issue] — that's not the standard ${biz} holds itself to. Here's what we'll do: [fix]. To make it right: [gesture]. Can we confirm this resolves it for you?`,
        },
        { kind: "tracker", title: "Complaint log + resolution tracker", content: "Columns: Date | Customer | Issue | Root cause | Action taken | Resolved (Y/N) | Follow-up | Repeat?" },
      ];
    case "referral_request":
      return [
        { kind: "customer_script", title: "Referral request message", content: `Hi [customer name], glad you're happy with ${biz}! If you know someone who'd benefit, send them our way — [referral incentive] for both of you.` },
        { kind: "tracker", title: "Referral tracker", content: "Columns: Referrer | Referred name | Contacted (Y/N) | Converted (Y/N) | Reward issued" },
      ];
    case "review_request":
      return [
        { kind: "review_request", title: "Review request message", content: `Hi [customer name], thanks for choosing ${biz}! A quick review helps us a lot: [review link]. It takes 30 seconds and means the world to a small business.` },
      ];
    case "b2b_outreach":
      return [
        { kind: "vendor_script", title: "B2B outreach script", content: `Hi [contact], I run ${biz}. We help businesses like yours with [value]. Could I send a short proposal or grab 10 minutes this week?` },
        { kind: "tracker", title: "B2B pipeline tracker", content: "Stages: Prospect | Contacted | Meeting | Proposal | Won/Lost. Columns: Company | Contact | Stage | Next step | Value | Date" },
      ];
    case "pricing_change":
      return [
        { kind: "pricing_calculator", title: "Price-change safety calculator", content: "Inputs: current price, unit cost, current volume. Compute: contribution margin before/after, break-even volume at new price, volume you can afford to lose. Do NOT drop below the gross-margin floor." },
        { kind: "checklist", title: "Price-change rollout checklist", content: "[ ] Margin floor checked  [ ] Top customers notified  [ ] Staff briefed  [ ] Menu/list updated  [ ] Review date set" },
      ];
    case "staff_training":
      return [
        { kind: "training_plan", title: "Staff training plan", content: "Goal: [skill]. Sessions: 1) demo 2) supervised practice 3) solo with check. Success = [measurable standard]. Sign-off by: [manager]." },
        { kind: "checklist", title: "Training completion checklist", content: "[ ] Demonstrated  [ ] Practiced supervised  [ ] Passed solo check  [ ] Signed off" },
      ];
    case "sop_creation":
      return [
        { kind: "sop", title: "Standard operating procedure", content: `SOP: [task] at ${biz}. Steps: 1) [ ] 2) [ ] 3) [ ]. Quality standard: [ ]. Who: [role]. When: [trigger]. Proof: [ ].` },
        { kind: "checklist", title: "SOP daily checklist", content: "[ ] Step 1  [ ] Step 2  [ ] Step 3  [ ] Quality check  [ ] Logged" },
      ];
    case "marketing_campaign":
      return [
        { kind: "campaign_plan", title: "Campaign plan", content: `Objective: [outcome]. Audience: [segment]. Offer: [offer]. Channels: [channels]. Budget cap: [amount]. Success metric: [metric]. Stop rule: if ROI < [floor] by [date], stop.` },
        { kind: "tracker", title: "Campaign result tracker", content: "Track: spend | leads | conversions | revenue | ROI%. Compare against the stop rule at review." },
      ];
    case "daily_ops":
      return [
        { kind: "daily_task_board", title: "Daily owner/staff task board", content: "Open: [ ] tasks. In progress: [ ]. Done: [ ]. Blockers → escalate. Owner reviews at [time]." },
      ];
    case "vendor_negotiation":
      return [
        { kind: "vendor_script", title: "Vendor negotiation script", content: `Hi [vendor], we value working with ${biz}↔you. Given [volume/loyalty], can we agree [ask: price/terms]? If not, we'll need to compare alternatives for [reason].` },
        { kind: "checklist", title: "Vendor review checklist", content: "[ ] Current terms  [ ] Alternatives priced  [ ] Target agreed  [ ] Follow-up date" },
      ];
    case "generic":
    default:
      return [
        { kind: "checklist", title: "Execution checklist", content: "[ ] Step 1  [ ] Step 2  [ ] Step 3  [ ] Proof captured  [ ] Outcome logged" },
      ];
  }
}

// --- steps / proof / owner workload per kind -------------------------------

function stepsFor(kind: WorkPackageActionKind): string[] {
  switch (kind) {
    case "customer_reactivation":
      return ["Pull the dormant customer list", "Send the prepared win-back message", "Log responses in the tracker", "Book returns and record revenue recovered"];
    case "complaint_recovery":
      return ["Acknowledge the complaint within 24h using the prepared response", "Apply the fix", "Confirm resolution with the customer", "Log root cause to prevent repeats"];
    case "marketing_campaign":
      return ["Confirm budget cap and stop rule", "Launch to the target segment", "Track spend/leads/ROI daily", "Apply the stop rule at review"];
    case "pricing_change":
      return ["Run the price-change calculator", "Confirm margin clears the floor", "Notify top customers and brief staff", "Update lists and set the review date"];
    default:
      return ["Prepare using the attached artifacts", "Execute the action", "Capture the required proof", "Log the outcome for review"];
  }
}

const PROOF_BY_KIND: Partial<Record<WorkPackageActionKind, string>> = {
  customer_reactivation: "Completed tracker rows with response outcomes + revenue recovered.",
  complaint_recovery: "Customer confirmation of resolution + logged root cause.",
  marketing_campaign: "Campaign tracker with spend, conversions, and ROI vs the stop rule.",
  pricing_change: "Calculator output showing margin clears the floor + updated price list.",
  staff_training: "Signed-off training checklist + a supervised competency check.",
};

/** Rough owner-minutes to do the task unaided, per kind. */
const OWNER_MINUTES_BEFORE: Partial<Record<WorkPackageActionKind, number>> = {
  customer_reactivation: 90,
  complaint_recovery: 30,
  referral_request: 30,
  review_request: 20,
  b2b_outreach: 120,
  pricing_change: 60,
  staff_training: 90,
  sop_creation: 120,
  marketing_campaign: 120,
  daily_ops: 30,
  vendor_negotiation: 60,
  generic: 45,
};

function ownerWorkload(kind: WorkPackageActionKind, level: WorkloadTransferLevel, ownerApprovalRequired: boolean): OwnerWorkloadEstimate {
  const before = OWNER_MINUTES_BEFORE[kind] ?? 45;
  let after: number;
  let burdenChange: OwnerWorkloadEstimate["burdenChange"];
  let ownerTaskAvoided: string;
  let decisionStillRequired: string;

  if (level === "LEVEL_5_BLOCKED") {
    after = Math.min(before, 10);
    burdenChange = "decreased";
    ownerTaskAvoided = "Pursuing an unsafe/blocked action.";
    decisionStillRequired = "Owner decides whether to pursue an alternative.";
  } else if (level === "LEVEL_2_STRUCTURED_TASK_EXECUTION") {
    after = ownerApprovalRequired ? 10 : 5; // owner only approves / spot-checks proof
    burdenChange = "decreased";
    ownerTaskAvoided = "Doing the task and chasing proof — OpsIQ assigned it and defined proof.";
    decisionStillRequired = ownerApprovalRequired ? "Owner approves before execution." : "Owner spot-checks the submitted proof.";
  } else if (level === "LEVEL_1_PREPARED_WORK") {
    after = Math.max(10, Math.round(before * 0.35)); // OpsIQ prepared the work; owner executes faster
    burdenChange = "decreased";
    ownerTaskAvoided = "Writing the scripts/checklists/trackers from scratch.";
    decisionStillRequired = "Owner executes the prepared work.";
  } else {
    after = before;
    burdenChange = "unchanged";
    ownerTaskAvoided = "None — advice only (no safe preparation possible).";
    decisionStillRequired = "Owner decides and executes.";
  }
  return { ownerTaskAvoided, estimatedMinutesBefore: before, estimatedMinutesAfter: after, burdenChange, decisionStillRequired };
}

/**
 * Generate a complete Work Package from a recommendation. Deterministic. Always
 * prepares artifacts where possible and records the owner-workload transfer.
 */
export function generateWorkPackage(input: WorkPackageInput): WorkPackage {
  const { level, reason } = determineMaxTransferLevel(input);
  const blocked = level === "LEVEL_5_BLOCKED";
  const financialDecision: FinancialDecision = input.financialDecision ?? "NEEDS_MORE_DATA";
  const riskLevel = input.riskLevel ?? "medium";
  const ownerApprovalRequired =
    input.ownerApprovalRequired ?? (financialDecision === "NEEDS_OWNER_APPROVAL" || riskLevel === "high" || riskLevel === "critical");

  const preparedArtifacts = blocked ? [] : artifactsFor(input.actionKind, input.businessName);
  const assignee: AssigneeRole = blocked ? "owner" : input.assigneeRole ?? "owner";
  const deadlineDays = input.deadlineDays ?? (riskLevel === "critical" ? 2 : riskLevel === "high" ? 5 : 14);
  const measurementWindowDays = input.measurementWindowDays ?? Math.max(deadlineDays, 14);

  const warnings: string[] = [];
  if (blocked) warnings.push(reason);
  if (financialDecision === "NEEDS_MORE_DATA") warnings.push("Financial impact not yet assessed — confirm affordability before spend.");
  if (ownerApprovalRequired && !blocked) warnings.push("Owner approval required before execution.");

  const requiredProof = blocked
    ? "N/A — action blocked."
    : PROOF_BY_KIND[input.actionKind] ?? "Completed checklist/tracker plus a dated artifact showing the action was done.";

  return {
    title: input.title,
    problem: input.problem,
    actionKind: input.actionKind,
    evidence: input.evidence ?? [],
    playbookRef: input.playbookRef ?? null,
    financialDecision,
    riskLevel,
    ownerApprovalRequired,
    maxTransferLevel: level,
    transferLevelReason: reason,
    steps: blocked ? ["Do not execute — see the block reason.", "Escalate to the owner for an alternative."] : stepsFor(input.actionKind),
    preparedArtifacts,
    assignee,
    deadlineDays,
    requiredProof,
    completionCriteria: blocked
      ? "Not applicable — blocked."
      : "All steps done, required proof captured, and the outcome logged for review.",
    rejectionCriteria: "Missing/insufficient proof, wrong assignee, action not actually performed, or outcome claimed without evidence.",
    expectedOutcome: input.expectedOutcome ?? "Measurable improvement on the target metric within the measurement window.",
    measurementWindowDays,
    ownerWorkload: ownerWorkload(input.actionKind, level, ownerApprovalRequired),
    escalationRule: blocked
      ? "Already escalated to the owner."
      : "Escalate to the owner if proof fails twice, the deadline is missed, or a blocker is reported.",
    learningUpdateRule: "On outcome, update playbook fit and assignee reliability; do not repeat a failed action without diagnosis.",
    blocked,
    warnings,
  };
}
