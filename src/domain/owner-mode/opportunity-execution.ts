/**
 * Opportunity Execution & Delegation Tracking (depth pass) — turns the opportunity loop's prep checklists,
 * tender readiness, proof-pack requirements, validation actions and portfolio decisions into governed,
 * trackable execution TASKS with owners and completion evidence. It answers: "who must do what next for this
 * opportunity, what evidence proves it was done, and what changes when it is completed?"
 *
 * Hard governance:
 * - OpsIQ only DRAFTS/RECOMMENDS tasks. It never submits a tender, contacts a customer, spends money, signs
 *   a contract, or certifies eligibility/legal/compliance.
 * - Material approval tasks (OWNER_APPROVAL_REVIEW) can never be auto-completed — an owner must act.
 * - Completion requires evidence where the task type demands it; missing/weak evidence keeps the task
 *   IN_PROGRESS or BLOCKED, never COMPLETED (no fake completion).
 * - A completed task updates the opportunity's readiness ONLY when its evidence is sufficient.
 * - No fabricated money / win probability / hidden score / unsupported fraud-HR language.
 */

import type {
  OperatingOpportunity,
} from "./opportunity-operating-layer";
import type { ApprovalLevel } from "./process-intelligence";

export type ExecutionSourceType =
  | "PREP_CHECKLIST" | "TENDER_READINESS" | "PROOF_PACK" | "VALIDATION_EXPERIMENT" | "PORTFOLIO_DECISION"
  | "CAPABILITY_GAP" | "MISSING_DATA" | "APPROVAL_POLICY" | "CASH_PROFIT_GUARDRAIL";

export type ExecutionTaskType =
  | "COLLECT_ELIGIBILITY_DATA" | "COLLECT_DOCUMENTS" | "COLLECT_COST_DATA" | "COLLECT_CAPACITY_DATA"
  | "PREPARE_BID_DRAFT" | "PREPARE_PROOF_PACK" | "CONTACT_LEADS_MANUALLY" | "RECORD_CUSTOMER_RESPONSES"
  | "RECORD_COST_EVIDENCE" | "RECORD_VALIDATION_RESULT" | "OWNER_APPROVAL_REVIEW" | "MANAGER_REVIEW"
  | "STAFF_DATA_COLLECTION" | "EXTERNAL_ADVISOR_REVIEW";

export type ExecutionActionOwner = "OWNER" | "MANAGER" | "STAFF" | "OPSIQ_DRAFT" | "EXTERNAL_ADVISOR" | "NO_ACTION";
export type ExecutionTaskStatus = "PROPOSED" | "ASSIGNED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED" | "REJECTED";

/** One governed execution task (21-field shape). */
export interface OpportunityExecutionTask {
  workspaceId: string;
  taskKey: string;
  opportunityKey: string;
  sourceType: ExecutionSourceType;
  sourceKey: string;
  taskType: ExecutionTaskType;
  taskTitle: string;
  taskDescription: string;
  nextActionOwner: ExecutionActionOwner;
  requiredEvidence: string[];
  dueAt: string | null;
  priority: number;
  status: ExecutionTaskStatus;
  approvalLevel: ApprovalLevel;
  riskIfSkipped: string;
  blockingReason: string | null;
  linkedProofIds: string[];
  evidenceRefs: string[];
  completedBy: string | null;
  completedAt: string | null;
  outcomeSummary: string | null;
  evaluatedAt: string;
}

/** Deterministic task identity — one task per (opportunity, taskType). */
export function executionTaskKey(workspaceId: string, opportunityKey: string, taskType: ExecutionTaskType): string {
  return `task:${workspaceId.slice(0, 8)}:${opportunityKey}:${taskType}`;
}

/** Persisted status the service overlays onto a derived task. */
export interface PersistedTaskStatus {
  status: ExecutionTaskStatus;
  completedBy: string | null;
  completedAt: string | null;
  outcomeSummary: string | null;
  evidenceRefs: string[];
  linkedProofIds: string[];
  blockingReason: string | null;
}

/** Which task types must never be auto-completed and always require the owner. */
const OWNER_ONLY_TASK = new Set<ExecutionTaskType>(["OWNER_APPROVAL_REVIEW"]);
/** Which task types require submitted evidence before they can be COMPLETED. */
const EVIDENCE_REQUIRED_TASK = new Set<ExecutionTaskType>([
  "COLLECT_ELIGIBILITY_DATA", "COLLECT_DOCUMENTS", "COLLECT_COST_DATA", "COLLECT_CAPACITY_DATA",
  "PREPARE_PROOF_PACK", "RECORD_CUSTOMER_RESPONSES", "RECORD_COST_EVIDENCE", "RECORD_VALIDATION_RESULT",
  "STAFF_DATA_COLLECTION",
]);

const TASK_OWNER: Record<ExecutionTaskType, ExecutionActionOwner> = {
  COLLECT_ELIGIBILITY_DATA: "MANAGER", COLLECT_DOCUMENTS: "MANAGER", COLLECT_COST_DATA: "MANAGER",
  COLLECT_CAPACITY_DATA: "STAFF", PREPARE_BID_DRAFT: "OPSIQ_DRAFT", PREPARE_PROOF_PACK: "OPSIQ_DRAFT",
  CONTACT_LEADS_MANUALLY: "MANAGER", RECORD_CUSTOMER_RESPONSES: "STAFF", RECORD_COST_EVIDENCE: "MANAGER",
  RECORD_VALIDATION_RESULT: "OWNER", OWNER_APPROVAL_REVIEW: "OWNER", MANAGER_REVIEW: "MANAGER",
  STAFF_DATA_COLLECTION: "STAFF", EXTERNAL_ADVISOR_REVIEW: "EXTERNAL_ADVISOR",
};

const TASK_EVIDENCE: Record<ExecutionTaskType, string[]> = {
  COLLECT_ELIGIBILITY_DATA: ["eligibility criteria captured"],
  COLLECT_DOCUMENTS: ["required documents gathered"],
  COLLECT_COST_DATA: ["per-unit cost", "expected margin"],
  COLLECT_CAPACITY_DATA: ["staff/equipment/delivery capacity confirmed"],
  PREPARE_BID_DRAFT: ["owner-reviewable bid draft (not a submission)"],
  PREPARE_PROOF_PACK: ["past-work / quality proof assembled"],
  CONTACT_LEADS_MANUALLY: ["who was contacted", "response recorded"],
  RECORD_CUSTOMER_RESPONSES: ["customer responses recorded"],
  RECORD_COST_EVIDENCE: ["actual cost / margin evidence"],
  RECORD_VALIDATION_RESULT: ["experiment result recorded via the validation-outcome path"],
  OWNER_APPROVAL_REVIEW: ["owner decision"],
  MANAGER_REVIEW: ["manager review note"],
  STAFF_DATA_COLLECTION: ["collected data attached"],
  EXTERNAL_ADVISOR_REVIEW: ["advisor guidance summary"],
};

function titleFor(taskType: ExecutionTaskType, o: { opportunityTitle: string }): string {
  const label = taskType.replace(/_/g, " ").toLowerCase();
  return `${label} — ${o.opportunityTitle}`;
}

/** Hints from the portfolio + validation stages (kept scalar to avoid cross-module coupling). */
export interface ExecutionHints {
  portfolioOwnerReview: boolean; // the top portfolio item requires owner review
  portfolioScaleCandidate: boolean; // the top portfolio item is a scale candidate (owner-approved)
  validationExperimentPending: boolean; // a designed experiment has not been run/recorded yet
  validationDataCollectionOnly: boolean; // the top experiment is data-collection-only
}

export interface ExecutionSummary {
  totalTasks: number;
  proposed: number;
  inProgressOrAssigned: number;
  blocked: number;
  completed: number;
  ownerApprovalRequired: number;
  delegated: number; // manager/staff/opsiq/advisor
}

export interface OpportunityExecutionAnalysis {
  workspaceId: string;
  tasks: OpportunityExecutionTask[];
  topTask: OpportunityExecutionTask | null;
  capabilityRecommendations: string[];
  summary: ExecutionSummary;
  evaluatedAt: string;
}

interface TaskSeed {
  opportunityKey: string;
  sourceType: ExecutionSourceType;
  sourceKey: string;
  taskType: ExecutionTaskType;
  riskIfSkipped: string;
  description: string;
  dueAt?: string | null;
}

/**
 * Derive the governed execution tasks from the live opportunity operating layer (+ portfolio/validation
 * hints), overlaying any persisted status. Pure + deterministic. The owner cockpit sees only the single top
 * task; everything else is grouped/counted. A completed evidence-backed task is reflected in the status.
 */
export function deriveOpportunityExecutionTasks(
  opportunities: OperatingOpportunity[],
  hints: ExecutionHints,
  persistedByKey: Map<string, PersistedTaskStatus>,
  workspaceId: string,
  evaluatedAt: string,
): OpportunityExecutionAnalysis {
  const seeds: TaskSeed[] = [];
  const capabilityRecommendations = new Set<string>();

  for (const o of opportunities) {
    // Rejected / expired opportunities produce no execution work.
    if (o.recommendedNextStep === "REJECT" || o.recommendedNextStep === "REJECT_UNFIT" || o.recommendedNextStep === "DO_NOT_BID" || o.freshness === "EXPIRED") continue;
    const oppKey = o.clusterKey;

    if (o.isTender && o.tenderReadiness) {
      const t = o.tenderReadiness;
      if (t.bidDecision === "COLLECT_ELIGIBILITY_DATA" || t.eligibilityStatus === "UNKNOWN" || t.eligibilityStatus === "NEEDS_DATA") {
        seeds.push({ opportunityKey: oppKey, sourceType: "TENDER_READINESS", sourceKey: `${oppKey}:eligibility`, taskType: "COLLECT_ELIGIBILITY_DATA", riskIfSkipped: "Cannot judge whether we even qualify to bid.", description: "Gather the tender eligibility criteria and confirm whether the business qualifies." });
      }
      if (t.missingDocuments.length > 0 || t.bidDecision === "COLLECT_DOCUMENTS") {
        seeds.push({ opportunityKey: oppKey, sourceType: "TENDER_READINESS", sourceKey: `${oppKey}:documents`, taskType: "COLLECT_DOCUMENTS", riskIfSkipped: "An incomplete bid is rejected on documents.", description: `Gather required tender documents${t.missingDocuments.length ? ": " + t.missingDocuments.join(", ") : ""}.` });
      }
      if (t.bidDecision === "COLLECT_COST_DATA") {
        seeds.push({ opportunityKey: oppKey, sourceType: "TENDER_READINESS", sourceKey: `${oppKey}:cost`, taskType: "COLLECT_COST_DATA", riskIfSkipped: "Pricing a bid without cost data risks a loss-making contract.", description: "Capture the cost / unit economics of fulfilling this tender." });
      }
      if (t.bidDecision === "OWNER_REVIEW_REQUIRED") {
        seeds.push({ opportunityKey: oppKey, sourceType: "APPROVAL_POLICY", sourceKey: `${oppKey}:owner-review`, taskType: "OWNER_APPROVAL_REVIEW", riskIfSkipped: "A high-exposure tender proceeds without owner sign-off.", description: "Owner review of tender cash/compliance exposure before any bid preparation." });
      }
      if (t.bidDecision === "PREPARE_BID_DRAFT") {
        seeds.push({ opportunityKey: oppKey, sourceType: "TENDER_READINESS", sourceKey: `${oppKey}:draft`, taskType: "PREPARE_BID_DRAFT", riskIfSkipped: "A ready tender lapses without an owner-reviewable draft.", description: "Prepare an owner-reviewable bid draft. OpsIQ drafts only — it never submits; the owner approves and submits." });
      }
      if (t.complianceRisk === "UNKNOWN" || t.complianceRisk === "HIGH") {
        seeds.push({ opportunityKey: oppKey, sourceType: "CAPABILITY_GAP", sourceKey: `${oppKey}:compliance`, taskType: "EXTERNAL_ADVISOR_REVIEW", riskIfSkipped: "Unclear compliance exposure on a governed contract.", description: "Advisory review of compliance/documentation requirements (advisory placeholder — OpsIQ does not certify)." });
        capabilityRecommendations.add("Recurring tender compliance uncertainty — build a compliance-check capability or retain an advisor.");
      }
    }

    // Proof-pack gaps → assemble evidence.
    if (o.proofPackRequirements.length > 0 && o.recommendedNextStep !== "PARK") {
      seeds.push({ opportunityKey: oppKey, sourceType: "PROOF_PACK", sourceKey: `${oppKey}:proofpack`, taskType: "PREPARE_PROOF_PACK", riskIfSkipped: "Weak win-readiness without a proof pack.", description: `Assemble the proof pack: ${o.proofPackRequirements.join(", ")}.` });
    }

    // Prep-checklist blocking items → collect cost/capacity where missing.
    if (o.prepChecklist) {
      if (o.prepChecklist.blockingItems.some((b) => /unit economics/i.test(b)) || o.prepChecklist.requiredCostInputs.length > 0) {
        seeds.push({ opportunityKey: oppKey, sourceType: "MISSING_DATA", sourceKey: `${oppKey}:cost`, taskType: "COLLECT_COST_DATA", riskIfSkipped: "The opportunity cannot be measured without unit economics.", description: "Collect the per-unit cost and expected margin so the opportunity can be measured." });
        capabilityRecommendations.add("Repeated opportunities blocked by missing unit economics — build a unit-economics capture capability.");
      }
    }

    // Non-tender high cash exposure → owner review of the cash guardrail.
    if (!o.isTender && o.negativeReasons.includes("CASH_EXPOSURE_RISK")) {
      seeds.push({ opportunityKey: oppKey, sourceType: "CASH_PROFIT_GUARDRAIL", sourceKey: `${oppKey}:cash`, taskType: "OWNER_APPROVAL_REVIEW", riskIfSkipped: "Committing cash to an opportunity before the owner accepts the exposure.", description: "Owner review of the cash/profit exposure before any spend on this opportunity." });
    }

    // A validate-ready non-tender opportunity → manual lead contact + result recording (never automated).
    if (!o.isTender && o.executionReadiness === "READY_TO_VALIDATE" && hints.validationExperimentPending) {
      seeds.push({ opportunityKey: oppKey, sourceType: "VALIDATION_EXPERIMENT", sourceKey: `${oppKey}:contact`, taskType: "CONTACT_LEADS_MANUALLY", riskIfSkipped: "The cheap validation never runs.", description: "Manually contact a small set of real prospects to run the validation — no automated outreach." });
      seeds.push({ opportunityKey: oppKey, sourceType: "VALIDATION_EXPERIMENT", sourceKey: `${oppKey}:record`, taskType: "RECORD_VALIDATION_RESULT", riskIfSkipped: "The portfolio stays stuck at NOT_STARTED.", description: "Record the validation result via the validation-outcome path so the portfolio can decide." });
    }
  }

  // Portfolio-level owner decisions.
  if (opportunities[0]) {
    const oppKey = opportunities[0].clusterKey;
    if (hints.portfolioOwnerReview) {
      seeds.push({ opportunityKey: oppKey, sourceType: "PORTFOLIO_DECISION", sourceKey: `${oppKey}:portfolio-review`, taskType: "OWNER_APPROVAL_REVIEW", riskIfSkipped: "A portfolio decision waits on the owner.", description: "Owner review of the portfolio decision for this opportunity." });
    }
    if (hints.portfolioScaleCandidate) {
      seeds.push({ opportunityKey: oppKey, sourceType: "PORTFOLIO_DECISION", sourceKey: `${oppKey}:scale`, taskType: "OWNER_APPROVAL_REVIEW", riskIfSkipped: "A validated, safe opportunity stalls without a scaling decision.", description: "Owner approval to scale this validated opportunity (a scaling plan is required)." });
    }
  }

  // Materialise tasks (dedupe by key; overlay persisted status).
  const byKey = new Map<string, OpportunityExecutionTask>();
  for (const seed of seeds) {
    const key = executionTaskKey(workspaceId, seed.opportunityKey, seed.taskType);
    if (byKey.has(key)) continue;
    const persisted = persistedByKey.get(key);
    const nextActionOwner = TASK_OWNER[seed.taskType];
    const approvalLevel: ApprovalLevel = OWNER_ONLY_TASK.has(seed.taskType) || nextActionOwner === "OWNER" ? "OWNER" : "MANAGER";
    const opp = opportunities.find((o) => o.clusterKey === seed.opportunityKey) ?? { opportunityTitle: seed.opportunityKey };
    byKey.set(key, {
      workspaceId,
      taskKey: key,
      opportunityKey: seed.opportunityKey,
      sourceType: seed.sourceType,
      sourceKey: seed.sourceKey,
      taskType: seed.taskType,
      taskTitle: titleFor(seed.taskType, opp),
      taskDescription: seed.description,
      nextActionOwner,
      requiredEvidence: TASK_EVIDENCE[seed.taskType],
      dueAt: seed.dueAt ?? null,
      priority: 0,
      status: persisted?.status ?? "PROPOSED",
      approvalLevel,
      riskIfSkipped: seed.riskIfSkipped,
      blockingReason: persisted?.blockingReason ?? null,
      linkedProofIds: persisted?.linkedProofIds ?? [],
      evidenceRefs: persisted?.evidenceRefs ?? [],
      completedBy: persisted?.completedBy ?? null,
      completedAt: persisted?.completedAt ?? null,
      outcomeSummary: persisted?.outcomeSummary ?? null,
      evaluatedAt,
    });
  }

  const tasks = Array.from(byKey.values());
  // Rank: actionable (not completed/cancelled) first; owner-approval ahead; then by source urgency.
  const STATUS_RANK: Record<ExecutionTaskStatus, number> = { BLOCKED: 0, PROPOSED: 1, ASSIGNED: 2, IN_PROGRESS: 3, COMPLETED: 8, CANCELLED: 9, REJECTED: 9 };
  tasks.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || Number(b.approvalLevel === "OWNER") - Number(a.approvalLevel === "OWNER"));
  tasks.forEach((t, i) => { t.priority = i + 1; });
  const topTask = tasks.find((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.status !== "REJECTED") ?? null;

  const summary: ExecutionSummary = {
    totalTasks: tasks.length,
    proposed: tasks.filter((t) => t.status === "PROPOSED").length,
    inProgressOrAssigned: tasks.filter((t) => t.status === "ASSIGNED" || t.status === "IN_PROGRESS").length,
    blocked: tasks.filter((t) => t.status === "BLOCKED").length,
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
    ownerApprovalRequired: tasks.filter((t) => t.approvalLevel === "OWNER").length,
    delegated: tasks.filter((t) => t.nextActionOwner === "MANAGER" || t.nextActionOwner === "STAFF" || t.nextActionOwner === "OPSIQ_DRAFT" || t.nextActionOwner === "EXTERNAL_ADVISOR").length,
  };

  return { workspaceId, tasks, topTask, capabilityRecommendations: Array.from(capabilityRecommendations), summary, evaluatedAt };
}

// ── Completion planning (the write-path guard) ───────────────────────────────────────────────────────────

const FORBIDDEN_LANGUAGE = /\b(fraud|fraudulent|theft|thief|embezzl|negligence|negligent|fire them|firing|payroll cut|docking pay|disciplin)\b/i;

export interface TaskUpdateSubmission {
  taskKey: string;
  opportunityKey: string;
  taskType: ExecutionTaskType;
  action: "ASSIGN" | "START" | "COMPLETE" | "BLOCK" | "CANCEL";
  actorRole?: string | null; // owner | manager | staff | ...
  evidenceRefs?: string[];
  linkedProofIds?: string[];
  outcomeSummary?: string | null;
  blockingReason?: string | null;
}

export interface TaskUpdatePlan {
  status: ExecutionTaskStatus;
  evidenceRefs: string[];
  linkedProofIds: string[];
  outcomeSummary: string | null;
  blockingReason: string | null;
  updatesOpportunity: boolean; // whether this completion should feed back into opportunity readiness
}
export type TaskPlanResult = { ok: true; plan: TaskUpdatePlan } | { ok: false; reason: string };

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * Validate a task update. Pure. Enforces: owner-approval tasks require an owner actor and cannot auto-complete;
 * evidence-required tasks cannot COMPLETE without evidence (→ IN_PROGRESS); forbidden language fails closed;
 * a valid evidence-backed completion updates the opportunity.
 */
export function planTaskUpdate(sub: TaskUpdateSubmission): TaskPlanResult {
  if (!sub || typeof sub !== "object") return { ok: false, reason: "A task update is required." };
  if (!clean(sub.taskKey)) return { ok: false, reason: "A taskKey is required." };
  if (!clean(sub.opportunityKey)) return { ok: false, reason: "An opportunityKey is required." };
  const outcome = clean(sub.outcomeSummary);
  const blocking = clean(sub.blockingReason);
  if ((outcome && FORBIDDEN_LANGUAGE.test(outcome)) || (blocking && FORBIDDEN_LANGUAGE.test(blocking))) {
    return { ok: false, reason: "The update must not contain fraud/negligence/HR-discipline language." };
  }
  const evidenceRefs = Array.from(new Set((sub.evidenceRefs ?? []).map(clean).filter((r): r is string => r !== null))).slice(0, 20);
  const linkedProofIds = Array.from(new Set((sub.linkedProofIds ?? []).map(clean).filter((r): r is string => r !== null))).slice(0, 20);
  const hasEvidence = evidenceRefs.length > 0 || linkedProofIds.length > 0;
  const actorRole = (clean(sub.actorRole) ?? "").toLowerCase();

  if (sub.action === "CANCEL") return { ok: true, plan: { status: "CANCELLED", evidenceRefs, linkedProofIds, outcomeSummary: outcome, blockingReason: blocking, updatesOpportunity: false } };
  if (sub.action === "BLOCK") return { ok: true, plan: { status: "BLOCKED", evidenceRefs, linkedProofIds, outcomeSummary: outcome, blockingReason: blocking ?? "blocked pending inputs", updatesOpportunity: false } };
  if (sub.action === "ASSIGN") return { ok: true, plan: { status: "ASSIGNED", evidenceRefs, linkedProofIds, outcomeSummary: outcome, blockingReason: null, updatesOpportunity: false } };
  if (sub.action === "START") return { ok: true, plan: { status: "IN_PROGRESS", evidenceRefs, linkedProofIds, outcomeSummary: outcome, blockingReason: null, updatesOpportunity: false } };

  // COMPLETE
  if (OWNER_ONLY_TASK.has(sub.taskType)) {
    if (actorRole !== "owner") return { ok: false, reason: "Only the owner can complete an owner-approval task." };
    if (!outcome) return { ok: false, reason: "An owner decision note is required to complete an approval task." };
    return { ok: true, plan: { status: "COMPLETED", evidenceRefs, linkedProofIds, outcomeSummary: outcome, blockingReason: null, updatesOpportunity: true } };
  }
  if (EVIDENCE_REQUIRED_TASK.has(sub.taskType) && !hasEvidence) {
    // Fake/weak completion (no evidence) is not accepted — the task stays in progress.
    return { ok: true, plan: { status: "IN_PROGRESS", evidenceRefs, linkedProofIds, outcomeSummary: outcome, blockingReason: "completion needs evidence — none attached", updatesOpportunity: false } };
  }
  return { ok: true, plan: { status: "COMPLETED", evidenceRefs, linkedProofIds, outcomeSummary: outcome, blockingReason: null, updatesOpportunity: hasEvidence } };
}
