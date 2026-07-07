/**
 * Business Survival & Recovery (PASS 32).
 *
 * A CONSERVATIVE, DETERMINISTIC crisis navigator. Given the simultaneous pressures of a business in trouble
 * (cash, revenue, customer/reputation, quality, operations/vendor, staff/capacity, owner overload, legal/
 * contract/tender, and a possibly-reckless growth temptation), it produces the SAFEST survival-first plan:
 * triage → stop-loss → cash protection → customer/reputation protection → operational stabilization → owner
 * workload reduction → SOP/training correction → capability closure → missing-data tasks → owner approval →
 * evidence-gated execution → reassessment milestones → recovery → and a thrive/growth gate that stays CLOSED
 * until stabilization is proven.
 *
 * Truth rule: it never guarantees success and never fabricates money/ROI/profit/runway. If survival is not
 * feasible under the available constraints, it says so honestly and routes a restructure / controlled-shutdown
 * review + urgent owner/expert decision instead of fake optimism.
 *
 * It has NO execution authority and creates NO new substrate — every action maps to the existing governed
 * ProcessExecutionTask / approval / evidence / reassessment systems. Pure + deterministic (no Date/random/IO).
 */

import { z } from "zod";
import type { CorrectionType, ProcessCorrection } from "./bottleneck-correction-routing";
import type { ExecutionRoute } from "./process-execution-bridge";
import type { ProcessStage, ProcessSeverity, ProcessConfidence, ExpectedImpactType, ApprovalLevel } from "./process-intelligence";
import { PUBLIC_ARCHETYPES, type PublicArchetype } from "./public-signal-interpretation";

export const PRESSURES = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Pressure = (typeof PRESSURES)[number];
const P: Record<Pressure, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const atLeast = (p: Pressure, min: Pressure) => P[p] >= P[min];

export const OPPORTUNITY_TEMPTATIONS = ["NONE", "GROWTH", "TENDER", "B2B", "DISCOUNT", "MARKETING", "LAUNCH"] as const;
export type OpportunityTemptation = (typeof OPPORTUNITY_TEMPTATIONS)[number];

/** The 16 crisis / survival decision states. */
export const CRISIS_STATES = [
  "SURVIVAL_TRIAGE_REQUIRED",
  "CASH_PROTECTION_REQUIRED",
  "STOP_LOSS_REQUIRED",
  "CUSTOMER_RECOVERY_REQUIRED",
  "QUALITY_STABILIZATION_REQUIRED",
  "OPERATIONS_STABILIZATION_REQUIRED",
  "OWNER_WORKLOAD_CRITICAL",
  "CAPABILITY_BLOCKER",
  "VALIDATION_BEFORE_GROWTH",
  "RESTRUCTURE_REQUIRED",
  "CONTROLLED_SHUTDOWN_REVIEW",
  "STABILIZATION_IN_PROGRESS",
  "RECOVERY_READY",
  "THRIVE_READY",
  "UNRECOVERABLE_UNDER_CURRENT_CONSTRAINTS",
  "UNKNOWN_NEEDS_DATA",
] as const;
export type CrisisState = (typeof CRISIS_STATES)[number];

export interface CrisisInput {
  crisisCaseId: string;
  workspaceArchetype: PublicArchetype;
  cashPressure: Pressure;
  revenuePressure: Pressure;
  customerPressure: Pressure;
  qualityPressure: Pressure;
  operationalPressure: Pressure;
  staffCapacityPressure: Pressure;
  ownerWorkloadPressure: Pressure;
  legalContractTenderRisk: Pressure;
  opportunityTemptation: OpportunityTemptation;
  unsafeActionTemptations?: string[];
  missingData?: string[];
  constraints?: {
    cashRunwayKnown?: boolean;
    feasibleNearTermRevenue?: boolean;
    ownerCapitalAvailable?: boolean;
    capacityFeasible?: boolean;
    stabilizationProven?: boolean;
  };
}

export interface SurvivalGovernedAction {
  key: string;
  title: string;
  correctionType: CorrectionType;
  executionRoute: ExecutionRoute;
  ownerApprovalRequired: boolean;
  evidenceRequired: string[];
  missingData: string[];
}

export interface RecoveryMilestone {
  order: number;
  milestone: string;
  evidenceRequired: string;
  reassessment: string;
}

export interface UnrecoverableAssessment {
  unrecoverable: boolean;
  reason: string | null;
  options: string[];
}

export interface SurvivalRecoveryPlan {
  crisisCaseId: string;
  workspaceArchetype: PublicArchetype;
  crisisStatus: CrisisState;
  survivalTopAction: SurvivalGovernedAction;
  immediateStopLossActions: string[];
  cashProtectionActions: string[];
  customerRecoveryActions: string[];
  operationsStabilizationActions: string[];
  ownerWorkloadReductionActions: string[];
  missingDataTasks: string[];
  ownerApprovalTasks: string[];
  managerStaffTasks: string[];
  blockedUnsafeActions: string[];
  recoveryMilestones: RecoveryMilestone[];
  stabilizationGate: string;
  thriveGate: string;
  unrecoverableRiskAssessment: UnrecoverableAssessment;
  cockpitSummary: string;
  auditTrace: string[];
}

const NO_MONEY = /[$£€]\s?\d|\b\d+(?:\.\d+)?\s?%|\bROI\b|\bMRR\b|guaranteed/i;
const noMoney = z.string().refine((s) => !NO_MONEY.test(s), { message: "no fabricated money/ROI/percentage/guarantee in a survival summary" });

const govActionSchema = z.object({
  key: z.string().min(1), title: noMoney.pipe(z.string().min(3)),
  correctionType: z.string().min(1), executionRoute: z.string().min(1),
  ownerApprovalRequired: z.boolean(), evidenceRequired: z.array(z.string()), missingData: z.array(z.string()),
});

export const survivalRecoveryPlanSchema = z.object({
  crisisCaseId: z.string().min(1),
  workspaceArchetype: z.enum(PUBLIC_ARCHETYPES),
  crisisStatus: z.enum(CRISIS_STATES),
  survivalTopAction: govActionSchema,
  immediateStopLossActions: z.array(z.string()),
  cashProtectionActions: z.array(z.string()),
  customerRecoveryActions: z.array(z.string()),
  operationsStabilizationActions: z.array(z.string()),
  ownerWorkloadReductionActions: z.array(z.string()),
  missingDataTasks: z.array(z.string()),
  ownerApprovalTasks: z.array(z.string()),
  managerStaffTasks: z.array(z.string()),
  blockedUnsafeActions: z.array(z.string()),
  recoveryMilestones: z.array(z.object({ order: z.number().int().positive(), milestone: noMoney.pipe(z.string().min(3)), evidenceRequired: z.string().min(3), reassessment: z.string().min(3) })).min(1),
  stabilizationGate: z.string().min(3),
  thriveGate: z.string().min(3),
  unrecoverableRiskAssessment: z.object({ unrecoverable: z.boolean(), reason: z.string().nullable(), options: z.array(z.string()) }),
  cockpitSummary: noMoney.pipe(z.string().min(3)),
  auditTrace: z.array(z.string()).min(1),
})
  // An unrecoverable case must be honest: restructure/shutdown-review status + options + no thrive-ready.
  .refine((p) => !p.unrecoverableRiskAssessment.unrecoverable || (p.crisisStatus === "UNRECOVERABLE_UNDER_CURRENT_CONSTRAINTS" || p.crisisStatus === "RESTRUCTURE_REQUIRED" || p.crisisStatus === "CONTROLLED_SHUTDOWN_REVIEW"), {
    message: "an unrecoverable assessment must map to a restructure/shutdown/unrecoverable status (no fake optimism)",
  })
  .refine((p) => p.unrecoverableRiskAssessment.unrecoverable === false || p.unrecoverableRiskAssessment.options.length > 0, {
    message: "an unrecoverable case must list survival/restructure/shutdown options",
  })
  // Growth/scale/marketing/tender-commit must always be blocked-before-stabilization (never absent).
  .refine((p) => p.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b)), {
    message: "growth/scale must be listed as blocked-before-stabilization in every crisis plan",
  })
  // Owner-approval route must be flagged owner-gated.
  .refine((p) => p.survivalTopAction.executionRoute !== "CREATE_OWNER_APPROVAL_TASK" || p.survivalTopAction.ownerApprovalRequired, {
    message: "an owner-approval top action must be flagged owner-gated",
  });

const ROUTE_FOR: Record<CorrectionType, ExecutionRoute> = {
  REVIEW_PROCESS_STEP: "CREATE_CORRECTION_TASK", UPDATE_CHECKLIST: "CREATE_SOP_CHECKLIST_TASK",
  ASSIGN_TRAINING_REVIEW: "CREATE_TRAINING_TASK", ESCALATE_TO_MANAGER: "CREATE_MANAGER_TASK",
  ESCALATE_TO_OWNER: "CREATE_OWNER_APPROVAL_TASK", RESOLVE_OPERATIONAL_EVENT: "CREATE_REASSESSMENT_TASK",
  REQUIRE_FRESH_PROOF: "CREATE_EVIDENCE_REQUEST", COLLECT_MISSING_DATA: "CREATE_MISSING_DATA_TASK",
  NO_ACTION_DATA_INSUFFICIENT: "MONITOR_ONLY",
};

function action(key: string, title: string, correctionType: CorrectionType, ownerApprovalRequired: boolean, evidenceRequired: string[], missingData: string[] = []): SurvivalGovernedAction {
  const route = ownerApprovalRequired ? "CREATE_OWNER_APPROVAL_TASK" : ROUTE_FOR[correctionType];
  return { key, title, correctionType: ownerApprovalRequired ? "ESCALATE_TO_OWNER" : correctionType, executionRoute: route, ownerApprovalRequired, evidenceRequired, missingData };
}
const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Build the survival/recovery plan for a crisis. Returns null when there is no crisis (a clean control:
 * every pressure NONE, no temptation, no missing data).
 */
export function planBusinessSurvivalRecovery(input: CrisisInput): SurvivalRecoveryPlan | null {
  const c = input.constraints ?? {};
  const missing = uniq(input.missingData ?? []);
  const temptation = input.opportunityTemptation;
  const anyPressure = [input.cashPressure, input.revenuePressure, input.customerPressure, input.qualityPressure,
    input.operationalPressure, input.staffCapacityPressure, input.ownerWorkloadPressure, input.legalContractTenderRisk].some((p) => P[p] > 0);
  if (!anyPressure && temptation === "NONE" && missing.length === 0) return null;

  const trace: string[] = [`crisis:${input.crisisCaseId}`];
  const blocked = new Set<string>(input.unsafeActionTemptations ?? []);
  // Every crisis blocks reckless external action by default.
  blocked.add("scale / growth / expansion before stabilization is proven");
  blocked.add("auto customer/tenant/buyer contact or auto-send of any draft");
  blocked.add("auto spend / discount / pricing change without owner approval");
  if (temptation === "TENDER") { blocked.add("tender auto-submit"); blocked.add("auto EMD payment / spend"); }
  if (temptation === "MARKETING" || temptation === "GROWTH" || temptation === "LAUNCH") blocked.add(`${temptation.toLowerCase()} before stabilization + validation`);
  if (temptation === "DISCOUNT") blocked.add("discount before margin/cash impact is known");

  // ── Honest unrecoverable check FIRST ──────────────────────────────────────
  const unrecoverable = input.cashPressure === "CRITICAL" && c.feasibleNearTermRevenue === false
    && c.ownerCapitalAvailable === false && c.capacityFeasible === false;
  const stopLoss: string[] = [];
  const cashActs: string[] = [];
  const customerActs: string[] = [];
  const opsActs: string[] = [];
  const ownerLoadActs: string[] = [];
  const missingDataTasks: string[] = [];
  const ownerApprovalTasks: string[] = [];
  const managerStaffTasks: string[] = [];

  if (unrecoverable) {
    trace.push("unrecoverable:no-runway-no-revenue-no-capital-no-capacity");
    const top = action("survival:restructure-review", "Owner/expert decision: restructure or controlled-shutdown review — survival is not feasible under current constraints", "ESCALATE_TO_OWNER", true,
      ["the owner's decision on restructure vs controlled shutdown, taken with an appropriate advisor"], missing.length ? missing : ["verified cash runway", "any feasible near-term revenue", "available owner capital"]);
    ownerApprovalTasks.push("Restructure vs controlled-shutdown decision (owner + advisor).");
    missingDataTasks.push(...(missing.length ? missing : ["verified cash runway", "feasible near-term revenue", "available owner capital"]));
    return finalise(input, "UNRECOVERABLE_UNDER_CURRENT_CONSTRAINTS", top, {
      stopLoss: ["Pause all non-essential spend immediately."], cashActs: ["Preserve remaining cash; commit nothing new."],
      customerActs, opsActs, ownerLoadActs, missingDataTasks, ownerApprovalTasks, managerStaffTasks,
      blocked, trace,
      unrecoverableRiskAssessment: { unrecoverable: true, reason: "No cash runway, no feasible near-term revenue, no owner capital, and capacity is not feasible — recovery is not achievable under current constraints. OpsIQ does not fake optimism.", options: ["RESTRUCTURE_REQUIRED", "CONTROLLED_SHUTDOWN_REVIEW", "urgent owner + independent expert decision"] },
    });
  }

  // ── Populate action buckets by pressure ───────────────────────────────────
  if (atLeast(input.cashPressure, "MEDIUM")) {
    stopLoss.push("Pause loss-making and non-essential spend now (owner-noted).");
    cashActs.push("Protect the cash runway: prioritise essential payments, hold discretionary spend.");
    if (!c.cashRunwayKnown || missing.some((m) => /cash|runway/i.test(m))) missingDataTasks.push("verified cash position and runway (measure the real figure — none is assumed)");
  }
  if (atLeast(input.customerPressure, "MEDIUM") || atLeast(input.qualityPressure, "MEDIUM")) {
    customerActs.push("Draft (not auto-send) a customer/reputation response for owner review; fix the underlying quality issue with proof.");
    managerStaffTasks.push("Run the inspection/correction on the failing step and submit completion evidence.");
  }
  if (atLeast(input.operationalPressure, "MEDIUM")) {
    opsActs.push("Escalate the vendor/maintenance issue and open a quote/confirmation task; reassess once resolved.");
    managerStaffTasks.push("Chase the vendor and record confirmation before closing the operational event.");
  }
  if (atLeast(input.ownerWorkloadPressure, "HIGH")) {
    ownerLoadActs.push("Delegate/route recurring firefighting to a manager and set a simple policy to reduce owner load.");
  }
  if (atLeast(input.staffCapacityPressure, "MEDIUM")) {
    managerStaffTasks.push("Assign training/SOP correction for the recurring gap (process coaching, never blame/discipline).");
    if (missing.some((m) => /capacity/i.test(m)) || !c.capacityFeasible) missingDataTasks.push("real capacity / staffing constraints (measure before taking on more)");
  }
  if (atLeast(input.legalContractTenderRisk, "MEDIUM")) {
    ownerApprovalTasks.push("Legal/contract/tender risk decision — owner reviews; nothing is committed, submitted, or spent automatically.");
  }
  if (temptation === "TENDER") missingDataTasks.push("tender eligibility documents, cost/margin fit, capacity, and EMD affordability (before any bid decision)");
  if (temptation === "B2B") missingDataTasks.push("our capacity, cost/margin, and reference proof (before any outreach)");
  if (temptation === "DISCOUNT") ownerApprovalTasks.push("Any discount/pricing change — owner decides once unit margin and cash impact are known.");
  missingDataTasks.push(...missing);

  // ── Determine the single top-level survival status + top action (severity ladder) ──
  let status: CrisisState;
  let top: SurvivalGovernedAction;
  if (input.cashPressure === "CRITICAL") {
    status = "SURVIVAL_TRIAGE_REQUIRED";
    top = action("survival:triage-cash", "Survival triage: stop-loss and protect the cash runway before anything else", "REVIEW_PROCESS_STEP", false, ["proof the loss-making activity is paused and essential-only spend is in force"], missingDataTasks.filter((m) => /cash|runway/i.test(m)));
  } else if (atLeast(input.cashPressure, "HIGH")) {
    status = "CASH_PROTECTION_REQUIRED";
    top = action("survival:cash", "Protect cash / runway: hold discretionary spend and measure the real cash position", "COLLECT_MISSING_DATA", false, ["the captured cash/runway figure"], missingDataTasks.filter((m) => /cash|runway/i.test(m)).length ? ["verified cash position and runway (measure the real figure — none is assumed)"] : []);
  } else if (atLeast(input.customerPressure, "HIGH") || (atLeast(input.customerPressure, "MEDIUM") && atLeast(input.qualityPressure, "HIGH"))) {
    status = "CUSTOMER_RECOVERY_REQUIRED";
    top = action("survival:customer", "Protect customers/reputation: fix the quality issue with proof; draft (not send) any response for the owner", "REVIEW_PROCESS_STEP", false, ["evidence the corrected step passes before the issue is closed"]);
  } else if (atLeast(input.qualityPressure, "HIGH")) {
    status = "QUALITY_STABILIZATION_REQUIRED";
    top = action("survival:quality", "Stabilise quality: correct the failing step and prove it before re-accepting work", "REVIEW_PROCESS_STEP", false, ["evidence the corrected step passes before completion"]);
  } else if (atLeast(input.operationalPressure, "HIGH")) {
    status = "OPERATIONS_STABILIZATION_REQUIRED";
    top = action("survival:ops", "Stabilise operations: resolve the vendor/maintenance event and reassess", "RESOLVE_OPERATIONAL_EVENT", false, ["vendor/maintenance completion confirmation"]);
  } else if (atLeast(input.legalContractTenderRisk, "HIGH")) {
    // A dominant legal/contract/tender risk is an owner decision; growth stays paused until it is resolved.
    status = "VALIDATION_BEFORE_GROWTH";
    top = action("survival:legal", "Owner decision required: legal/contract/tender risk — nothing committed, submitted, or spent automatically", "ESCALATE_TO_OWNER", true, ["the supporting evidence for the owner decision"]);
  } else if (atLeast(input.ownerWorkloadPressure, "HIGH")) {
    status = "OWNER_WORKLOAD_CRITICAL";
    top = action("survival:owner-load", "Reduce owner overload: delegate recurring firefighting and set a simple governing policy", "ESCALATE_TO_MANAGER", false, ["evidence the delegation/policy is in place"]);
  } else if (atLeast(input.staffCapacityPressure, "HIGH")) {
    status = "CAPABILITY_BLOCKER";
    top = action("survival:capability", "Close the capability/staffing blocker: training/SOP correction and measure real capacity", "ASSIGN_TRAINING_REVIEW", false, ["proof the training/SOP was adopted"]);
  } else if (temptation !== "NONE") {
    status = "VALIDATION_BEFORE_GROWTH";
    top = action("survival:validate", "Validate before growth: collect the missing internal data; the opportunity stays blocked until stability is proven", "COLLECT_MISSING_DATA", false, ["the missing internal data listed"], missingDataTasks);
  } else if (c.stabilizationProven === true) {
    status = "STABILIZATION_IN_PROGRESS";
    top = action("survival:reassess", "Reassess stabilization progress before any recovery/growth step", "RESOLVE_OPERATIONAL_EVENT", false, ["evidence the stabilization milestones are met"]);
  } else if (missing.length > 0) {
    status = "UNKNOWN_NEEDS_DATA";
    top = action("survival:data", "Collect the missing internal data before drawing any conclusion", "COLLECT_MISSING_DATA", false, ["the missing internal data"], missing);
  } else {
    status = "OPERATIONS_STABILIZATION_REQUIRED";
    top = action("survival:stabilise", "Stabilise the operation and reassess", "RESOLVE_OPERATIONAL_EVENT", false, ["evidence the operation is stabilised"]);
  }

  return finalise(input, status, top, {
    stopLoss, cashActs, customerActs, opsActs, ownerLoadActs,
    missingDataTasks: uniq(missingDataTasks), ownerApprovalTasks: uniq(ownerApprovalTasks), managerStaffTasks: uniq(managerStaffTasks),
    blocked, trace, unrecoverableRiskAssessment: { unrecoverable: false, reason: null, options: [] },
  });
}

function finalise(input: CrisisInput, status: CrisisState, top: SurvivalGovernedAction, b: {
  stopLoss: string[]; cashActs: string[]; customerActs: string[]; opsActs: string[]; ownerLoadActs: string[];
  missingDataTasks: string[]; ownerApprovalTasks: string[]; managerStaffTasks: string[];
  blocked: Set<string>; trace: string[]; unrecoverableRiskAssessment: UnrecoverableAssessment;
}): SurvivalRecoveryPlan {
  b.trace.push(`status:${status}`, `top:${top.key}`);
  const stabilizationGate = "Stabilization is proven only when: the real cash position/runway is measured and not shrinking, customer/quality issues are validated and corrected with executed-outcome evidence, and no critical unresolved operational or legal/contract risk remains.";
  const thriveGate = "Growth / scale / marketing / launch / tender-commitment / discount stays BLOCKED until stabilization is proven AND cost/capacity data exists AND the owner approves — no scale before validation, and no guaranteed outcome is claimed.";
  const recoveryMilestones: RecoveryMilestone[] = [
    { order: 1, milestone: "Stop-loss in force: loss-making/non-essential spend paused.", evidenceRequired: "owner-noted confirmation the spend/activity is paused.", reassessment: "re-check spend after one cycle." },
    { order: 2, milestone: "Cash position/runway measured (the real figure — never assumed).", evidenceRequired: "the captured cash/runway figure from the owner's own data.", reassessment: "re-measure runway at the next review." },
    { order: 3, milestone: "Customer/quality issue corrected with proof.", evidenceRequired: "evidence the corrected step passes; a governed reassessment confirms it worked.", reassessment: "re-check the defect/complaint rate after execution." },
    { order: 4, milestone: "Operational/vendor risk resolved.", evidenceRequired: "vendor/maintenance completion confirmation.", reassessment: "re-check response/resolution after the fix." },
    { order: 5, milestone: "Owner workload reduced via delegation/policy.", evidenceRequired: "evidence the delegation/policy is in place.", reassessment: "re-check owner load after one cycle." },
    { order: 6, milestone: "Stabilization gate met → recovery plan.", evidenceRequired: "all stabilization criteria evidenced.", reassessment: "owner reviews before any growth step." },
  ];
  const cockpitSummary = `Crisis status: ${status}. Top survival action: ${top.title}. Growth/scale stays blocked until the stabilization gate is met; nothing is auto-submitted, spent, or contacted, and no financial outcome is implied.`;
  return {
    crisisCaseId: input.crisisCaseId,
    workspaceArchetype: input.workspaceArchetype,
    crisisStatus: status,
    survivalTopAction: top,
    immediateStopLossActions: b.stopLoss,
    cashProtectionActions: b.cashActs,
    customerRecoveryActions: b.customerActs,
    operationsStabilizationActions: b.opsActs,
    ownerWorkloadReductionActions: b.ownerLoadActs,
    missingDataTasks: b.missingDataTasks,
    ownerApprovalTasks: b.ownerApprovalTasks,
    managerStaffTasks: b.managerStaffTasks,
    blockedUnsafeActions: [...b.blocked],
    recoveryMilestones,
    stabilizationGate, thriveGate,
    unrecoverableRiskAssessment: b.unrecoverableRiskAssessment,
    cockpitSummary,
    auditTrace: b.trace,
  };
}

/** Plan AND validate — an incoherent/unsafe plan can never enter the governed path. */
export function planAndValidateSurvival(
  input: CrisisInput,
): { ok: true; plan: SurvivalRecoveryPlan } | { ok: false; issues: string[] } | { ok: true; plan: null } {
  const plan = planBusinessSurvivalRecovery(input);
  if (plan === null) return { ok: true, plan: null };
  const parsed = survivalRecoveryPlanSchema.safeParse(plan);
  if (parsed.success) return { ok: true, plan };
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return { ok: false, issues };
}

/**
 * Map the survival plan's governed actions into ProcessCorrections for the ALREADY-PROVEN execution bridge:
 * the top survival action + each owner-approval task + each missing-data task + each manager/staff correction.
 * One correction per governed action — never per crisis signal. The bridge remains the authority.
 */
export function survivalPlanToProcessCorrections(plan: SurvivalRecoveryPlan, workspaceId: string): ProcessCorrection[] {
  const out: ProcessCorrection[] = [];
  const mk = (key: string, title: string, ct: CorrectionType, owner: boolean, missingData: string[], rank: number) => {
    const severity: ProcessSeverity = rank <= 1 ? "CRITICAL" : rank <= 3 ? "HIGH" : "MEDIUM";
    const confidence: ProcessConfidence = "MEDIUM";
    const stage: ProcessStage = ct === "COLLECT_MISSING_DATA" ? "INTAKE" : "DELIVERY";
    const impact: ExpectedImpactType = "QUALITY_RISK";
    const approval: ApprovalLevel = owner ? "OWNER" : ct === "COLLECT_MISSING_DATA" ? "STAFF" : "MANAGER";
    out.push({
      workspaceId, correctionId: key, sourceFindingType: "REWORK_LOOP", correctionType: owner ? "ESCALATE_TO_OWNER" : ct,
      title: title.slice(0, 80), instruction: title, rationale: `Survival/recovery action (${plan.crisisStatus}) — governed, evidence-gated; no fabricated financials; growth blocked until stabilization.`,
      affectedStage: stage, targetActorId: null, targetManagerId: null, severity, confidence, priorityRank: rank,
      requiredApprovalLevel: approval, requiresOwnerApproval: owner, autoExecutable: false, expectedImpactType: impact,
      supportingProofIds: [], supportingOperationalEventIds: [], supportingEscalationIds: [], supportingAdjudicationIds: [],
      missingData: (owner ? false : ct === "COLLECT_MISSING_DATA") ? missingData : [], status: "PROPOSED",
    });
  };
  const t = plan.survivalTopAction;
  mk(`sv-top-${t.key.replace(/[^a-z0-9]+/gi, "-")}`, t.title, t.correctionType, t.ownerApprovalRequired, t.missingData, 1);
  plan.missingDataTasks.slice(0, 3).forEach((m, i) => mk(`sv-data-${i}`, `Collect missing internal data: ${m}`, "COLLECT_MISSING_DATA", false, [m], 4));
  plan.ownerApprovalTasks.slice(0, 3).forEach((o, i) => mk(`sv-owner-${i}`, o, "ESCALATE_TO_OWNER", true, [], 2));
  plan.managerStaffTasks.slice(0, 3).forEach((s, i) => mk(`sv-staff-${i}`, s, /training|sop/i.test(s) ? "ASSIGN_TRAINING_REVIEW" : "REVIEW_PROCESS_STEP", false, [], 3));
  // Dedupe by correctionId (a governed action may recur across buckets).
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.correctionId) ? false : (seen.add(x.correctionId), true)));
}
