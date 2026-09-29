/**
 * Owner Recovery Status (PASS 37).
 *
 * A READ-ONLY, deterministic projection of the PASS 32 survival planner + PASS 33 recovery milestone state
 * machine into an owner-facing recovery status summary. It creates NO new recovery logic and NO new gate
 * rules: it runs the already-proven planBusinessSurvivalRecovery + computeRecoveryExecution and maps their
 * output into a governed, fail-closed response. It never mutates tasks, never fabricates money/cash/runway,
 * never opens the thrive gate without proven stabilization, and always carries the "recovery is not
 * guaranteed" statement. Pure (no Date/random/IO).
 */

import { z } from "zod";
import { PUBLIC_ARCHETYPES, type PublicArchetype } from "./public-signal-interpretation";
import { planBusinessSurvivalRecovery, type CrisisInput, type Pressure, type SurvivalRecoveryPlan } from "./business-survival-recovery";
import { computeRecoveryExecution, type MilestoneOutcome, type RecoveryExecutionView } from "./recovery-milestone-execution";

/** The 11 owner-facing recovery statuses (a projection of the 21 internal recovery states). */
export const RECOVERY_STATUSES = [
  "NONE",
  "SURVIVAL_TRIAGE_ACTIVE",
  "RECOVERY_IN_PROGRESS",
  "STABILIZATION_NOT_PROVEN",
  "STABILIZATION_PROVEN",
  "THRIVE_GATE_BLOCKED",
  "THRIVE_GATE_ELIGIBLE",
  "REGRESSED",
  "RESTRUCTURE_REVIEW_REQUIRED",
  "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED",
  "UNKNOWN_NEEDS_DATA",
] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

const NO_GUARANTEE = "Recovery is not guaranteed.";
const UNCERTAINTY =
  "OpsIQ shows the next governed recovery step based on current evidence. Stabilization is not proven until required evidence and reassessment pass.";

const NO_MONEY = /[$£€]\s?\d|\b\d+(?:\.\d+)?\s?%|\bROI\b|\bMRR\b|guaranteed (recovery|success|profit)/i;
const noMoney = (label: string) => z.string().refine((s) => !NO_MONEY.test(s), { message: `no fabricated money/guaranteed-outcome text in ${label}` });

export interface OwnerRecoveryStatusResponse {
  recoveryStatus: RecoveryStatus;
  topRecoveryBottleneck: string | null;
  nextMilestone: { order: number; milestone: string; requiredEvidence: string } | null;
  completedMilestones: number[];
  blockedMilestones: number[];
  requiredEvidence: string[];
  requiredReassessment: string;
  ownerApprovalRequired: boolean;
  managerStaffActions: string[];
  blockedUnsafeActions: string[];
  stabilizationGate: "OPEN" | "BLOCKED";
  thriveGate: "ELIGIBLE" | "BLOCKED";
  uncertaintyCaveat: string;
  noGuaranteeStatement: string;
  sourceRefs: string[];
  linkedProcessExecutionTaskIds: string[];
}

const ACTIVE_STATUSES: ReadonlySet<RecoveryStatus> = new Set([
  "SURVIVAL_TRIAGE_ACTIVE", "RECOVERY_IN_PROGRESS", "STABILIZATION_NOT_PROVEN", "STABILIZATION_PROVEN",
  "THRIVE_GATE_BLOCKED", "THRIVE_GATE_ELIGIBLE", "REGRESSED", "RESTRUCTURE_REVIEW_REQUIRED", "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED",
]);
const TERMINAL_REVIEW: ReadonlySet<RecoveryStatus> = new Set(["RESTRUCTURE_REVIEW_REQUIRED", "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED"]);

export const ownerRecoveryStatusSchema = z.object({
  recoveryStatus: z.enum(RECOVERY_STATUSES),
  topRecoveryBottleneck: z.string().min(3).nullable(),
  nextMilestone: z.object({ order: z.number().int().positive(), milestone: z.string().min(3), requiredEvidence: z.string().min(3) }).nullable(),
  completedMilestones: z.array(z.number().int()),
  blockedMilestones: z.array(z.number().int()),
  requiredEvidence: z.array(z.string()),
  requiredReassessment: z.string().min(3),
  ownerApprovalRequired: z.boolean(),
  managerStaffActions: z.array(z.string()),
  blockedUnsafeActions: z.array(z.string()),
  stabilizationGate: z.enum(["OPEN", "BLOCKED"]),
  thriveGate: z.enum(["ELIGIBLE", "BLOCKED"]),
  uncertaintyCaveat: noMoney("the uncertainty caveat").pipe(z.string().min(10)),
  noGuaranteeStatement: z.string().min(3).refine((s) => /not guaranteed/i.test(s), { message: "the no-guarantee statement must state recovery is not guaranteed" }),
  sourceRefs: z.array(z.string()),
  linkedProcessExecutionTaskIds: z.array(z.string()),
})
  // The thrive gate can be ELIGIBLE only when stabilization is proven (OPEN) — never before.
  .refine((r) => r.thriveGate !== "ELIGIBLE" || r.stabilizationGate === "OPEN", {
    message: "thrive gate can be eligible only after stabilization is proven",
  })
  // Stabilization OPEN requires every milestone proven (no skipped milestone).
  .refine((r) => r.stabilizationGate !== "OPEN" || r.blockedMilestones.length === 0, {
    message: "stabilization cannot be open while any milestone is still blocked",
  })
  // A restructure/shutdown review keeps the thrive gate blocked and requires owner approval.
  .refine((r) => !TERMINAL_REVIEW.has(r.recoveryStatus) || (r.thriveGate === "BLOCKED" && r.ownerApprovalRequired), {
    message: "a restructure/shutdown review must keep the thrive gate blocked and require owner approval",
  })
  // Any active crisis/recovery status must keep unsafe scale/growth actions blocked.
  .refine((r) => !ACTIVE_STATUSES.has(r.recoveryStatus) || r.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b)), {
    message: "an active recovery status must block unsafe scale/growth actions",
  })
  // The no-guarantee statement is mandatory (belt-and-braces with the field refine above).
  .refine((r) => r.noGuaranteeStatement.trim().length > 0, { message: "the no-guarantee statement is required" });

/** Project the internal 21-state recovery machine onto the 11 owner-facing statuses. */
function projectStatus(view: RecoveryExecutionView): RecoveryStatus {
  switch (view.currentRecoveryState) {
    case "CRISIS_IDENTIFIED":
    case "SURVIVAL_TRIAGE_ACTIVE":
      return "SURVIVAL_TRIAGE_ACTIVE";
    case "STABILIZATION_NOT_PROVEN":
      return "STABILIZATION_NOT_PROVEN";
    case "STABILIZATION_PROVEN":
      return "STABILIZATION_PROVEN";
    case "THRIVE_GATE_BLOCKED":
      return "THRIVE_GATE_BLOCKED";
    case "THRIVE_GATE_ELIGIBLE":
      return "THRIVE_GATE_ELIGIBLE";
    case "RECOVERY_REGRESSED":
      return "REGRESSED";
    case "RESTRUCTURE_REVIEW_REQUIRED":
      return "RESTRUCTURE_REVIEW_REQUIRED";
    case "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED":
      return "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED";
    case "UNKNOWN_NEEDS_DATA":
      return "UNKNOWN_NEEDS_DATA";
    default:
      // All the *_PENDING / *_WITH_EVIDENCE working states → recovery in progress.
      return "RECOVERY_IN_PROGRESS";
  }
}

/** Map a proven plan + recovery view into the fail-closed owner response (pure). */
export function mapRecoveryStatus(
  plan: SurvivalRecoveryPlan | null,
  view: RecoveryExecutionView | null,
  linkedProcessExecutionTaskIds: string[] = [],
): OwnerRecoveryStatusResponse {
  // No plan → no crisis → nothing to recover. Never fabricate a recovery.
  if (!plan || !view) {
    return {
      recoveryStatus: "NONE",
      topRecoveryBottleneck: null,
      nextMilestone: null,
      completedMilestones: [],
      blockedMilestones: [],
      requiredEvidence: [],
      requiredReassessment: "No recovery is in progress; nothing is required right now.",
      ownerApprovalRequired: false,
      managerStaffActions: [],
      blockedUnsafeActions: ["No unsafe automation: OpsIQ never scales, spends, contacts, or contracts on its own."],
      stabilizationGate: "BLOCKED",
      thriveGate: "BLOCKED",
      uncertaintyCaveat: UNCERTAINTY,
      noGuaranteeStatement: NO_GUARANTEE,
      sourceRefs: [],
      linkedProcessExecutionTaskIds: [],
    };
  }
  return {
    recoveryStatus: projectStatus(view),
    topRecoveryBottleneck: view.nextMilestone?.milestone ?? plan.survivalTopAction.title,
    nextMilestone: view.nextMilestone,
    completedMilestones: view.completedMilestones,
    blockedMilestones: view.blockedMilestones,
    requiredEvidence: view.requiredEvidence,
    requiredReassessment: view.reassessmentRequirement,
    ownerApprovalRequired: view.ownerApprovalRequired,
    managerStaffActions: view.managerStaffActions,
    blockedUnsafeActions: view.blockedUnsafeActions.length
      ? view.blockedUnsafeActions
      : ["Scaling (acquisition spend, campaign expansion, new launches) stays blocked until stabilization is proven."],
    stabilizationGate: view.stabilizationGateStatus,
    thriveGate: view.thriveGateStatus,
    uncertaintyCaveat: UNCERTAINTY,
    noGuaranteeStatement: NO_GUARANTEE,
    sourceRefs: view.auditTrace,
    linkedProcessExecutionTaskIds,
  };
}

export interface RecoveryStatusInput {
  crisis: CrisisInput | null;
  outcomes?: MilestoneOutcome[];
  linkedProcessExecutionTaskIds?: string[];
}

/** Build AND validate the owner recovery status from a crisis input (runs the proven modules). */
export function buildOwnerRecoveryStatus(
  input: RecoveryStatusInput,
): { ok: true; status: OwnerRecoveryStatusResponse } | { ok: false; issues: string[] } {
  const plan = input.crisis ? planBusinessSurvivalRecovery(input.crisis) : null;
  const view = plan
    ? computeRecoveryExecution({ recoveryCaseId: input.crisis!.crisisCaseId, workspaceArchetype: input.crisis!.workspaceArchetype, plan, outcomes: input.outcomes })
    : null;
  const status = mapRecoveryStatus(plan, view, input.linkedProcessExecutionTaskIds ?? []);
  const parsed = ownerRecoveryStatusSchema.safeParse(status);
  if (parsed.success) return { ok: true, status };
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return { ok: false, issues };
}

// ── Conservative crisis derivation from live signal severities ─────────────────────────────────────────
// Absence of a signal → NONE pressure → no fabricated crisis. Never invents constraints (so it never
// fabricates unrecoverability either).

export interface CrisisSignalSeverities {
  caseId: string;
  archetype: PublicArchetype;
  cashSeverity?: string | null;
  qualitySeverity?: string | null;
  operationalSeverity?: string | null;
  workloadSeverity?: string | null;
  customerSeverity?: string | null;
  missingData?: string[];
}

const SEV_TO_PRESSURE: Record<string, Pressure> = { CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };
const pressure = (s?: string | null): Pressure => (s && SEV_TO_PRESSURE[s.toUpperCase()]) || "NONE";

/** Derive a conservative CrisisInput from live signal severities. Returns null when there is no signal at
 *  all (clean workspace) so the recovery status is honestly NONE. */
export function deriveCrisisInput(sig: CrisisSignalSeverities): CrisisInput | null {
  const archetype: PublicArchetype = PUBLIC_ARCHETYPES.includes(sig.archetype) ? sig.archetype : "laundry_local_service";
  const crisis: CrisisInput = {
    crisisCaseId: sig.caseId,
    workspaceArchetype: archetype,
    cashPressure: pressure(sig.cashSeverity),
    revenuePressure: "NONE",
    customerPressure: pressure(sig.customerSeverity),
    qualityPressure: pressure(sig.qualitySeverity),
    operationalPressure: pressure(sig.operationalSeverity),
    staffCapacityPressure: "NONE",
    ownerWorkloadPressure: pressure(sig.workloadSeverity),
    legalContractTenderRisk: "NONE",
    opportunityTemptation: "NONE",
    missingData: sig.missingData?.slice(0, 20) ?? [],
  };
  const anyPressure = [crisis.cashPressure, crisis.customerPressure, crisis.qualityPressure, crisis.operationalPressure, crisis.ownerWorkloadPressure]
    .some((p) => p !== "NONE");
  return anyPressure ? crisis : null;
}
