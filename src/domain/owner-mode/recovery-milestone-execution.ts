/**
 * Recovery Milestone Execution (PASS 33).
 *
 * A CONSERVATIVE, DETERMINISTIC state machine that drives a PASS 32 survival/recovery plan FORWARD through its
 * milestones over successive governed cycles. It consumes the plan plus the real ProcessExecutionTask outcomes
 * (executed? evidence provided? reassessment improved/worsened?) and advances the recovery ONLY when evidence
 * and reassessment prove readiness.
 *
 * Hard rules enforced here:
 *   - No milestone can be skipped (the next milestone is always the first not-proven one, in order).
 *   - No milestone completes without evidence.
 *   - Correction milestones (quality/operations) and the stabilization milestone require a PASSING reassessment.
 *   - The stabilization gate opens only when every required milestone is proven.
 *   - The thrive/growth gate stays BLOCKED until stabilization is proven; then it is ELIGIBLE only with owner
 *     approval + evidence (never auto).
 *   - If reassessment fails/worsens, the recovery REGRESSES and loops back to correction — it does not advance.
 *   - If the business is unrecoverable, the restructure/controlled-shutdown review stays active — no fake recovery.
 *
 * It has NO execution authority and creates NO new substrate — every task is the existing ProcessExecutionTask /
 * approval / evidence / reassessment machinery. Pure + deterministic (no Date/random/IO). No fabricated money.
 */

import { z } from "zod";
import { PUBLIC_ARCHETYPES, type PublicArchetype } from "./public-signal-interpretation";
import type { SurvivalRecoveryPlan } from "./business-survival-recovery";

/** The 21 recovery states. */
export const RECOVERY_STATES = [
  "CRISIS_IDENTIFIED",
  "SURVIVAL_TRIAGE_ACTIVE",
  "STOP_LOSS_PENDING",
  "STOP_LOSS_EXECUTED_WITH_EVIDENCE",
  "CASH_DATA_PENDING",
  "CASH_POSITION_MEASURED",
  "QUALITY_CORRECTION_PENDING",
  "QUALITY_CORRECTED_WITH_EVIDENCE",
  "OPERATIONS_CORRECTION_PENDING",
  "OPERATIONS_STABILIZED_WITH_EVIDENCE",
  "WORKLOAD_REDUCTION_PENDING",
  "WORKLOAD_REDUCED_WITH_EVIDENCE",
  "REASSESSMENT_PENDING",
  "STABILIZATION_NOT_PROVEN",
  "STABILIZATION_PROVEN",
  "THRIVE_GATE_BLOCKED",
  "THRIVE_GATE_ELIGIBLE",
  "RECOVERY_REGRESSED",
  "RESTRUCTURE_REVIEW_REQUIRED",
  "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED",
  "UNKNOWN_NEEDS_DATA",
] as const;
export type RecoveryState = (typeof RECOVERY_STATES)[number];

export const REASSESSMENT_RESULTS = ["IMPROVED", "WORSENED", "PENDING", "NOT_APPLICABLE"] as const;
export type ReassessmentResult = (typeof REASSESSMENT_RESULTS)[number];

/** The outcome of one milestone's governed task, as reported by the ProcessExecutionTask layer. */
export interface MilestoneOutcome {
  order: number;
  executed: boolean;
  evidenceProvided: boolean;
  reassessment?: ReassessmentResult;
}

export interface RecoveryInput {
  recoveryCaseId: string;
  workspaceArchetype: PublicArchetype;
  plan: SurvivalRecoveryPlan;
  outcomes?: MilestoneOutcome[];
}

/** The pending state for the milestone at each order (1-based, matching the plan's milestone ladder). */
const PENDING_STATE: Record<number, RecoveryState> = {
  1: "STOP_LOSS_PENDING",
  2: "CASH_DATA_PENDING",
  3: "QUALITY_CORRECTION_PENDING",
  4: "OPERATIONS_CORRECTION_PENDING",
  5: "WORKLOAD_REDUCTION_PENDING",
  6: "REASSESSMENT_PENDING",
};
/** Milestones whose completion requires a PASSING reassessment (correction + stabilization). */
const NEEDS_REASSESSMENT: ReadonlySet<number> = new Set([3, 4, 6]);

export interface RecoveryExecutionView {
  recoveryCaseId: string;
  workspaceArchetype: PublicArchetype;
  currentRecoveryState: RecoveryState;
  completedMilestones: number[];
  blockedMilestones: number[];
  nextMilestone: { order: number; milestone: string; requiredEvidence: string } | null;
  requiredEvidence: string[];
  reassessmentRequirement: string;
  stabilizationGateStatus: "OPEN" | "BLOCKED";
  thriveGateStatus: "ELIGIBLE" | "BLOCKED";
  regressionDetected: boolean;
  restructureOrShutdownRequired: boolean;
  ownerApprovalRequired: boolean;
  managerStaffActions: string[];
  blockedUnsafeActions: string[];
  cockpitSummary: string;
  auditTrace: string[];
}

const NO_MONEY = /[$£€]\s?\d|\b\d+(?:\.\d+)?\s?%|\bROI\b|\bMRR\b|guaranteed (recovery|success|profit)/i;
const noMoney = z.string().refine((s) => !NO_MONEY.test(s), { message: "no fabricated money/guaranteed-outcome text in a recovery summary" });

export const recoveryExecutionViewSchema = z.object({
  recoveryCaseId: z.string().min(1),
  workspaceArchetype: z.enum(PUBLIC_ARCHETYPES),
  currentRecoveryState: z.enum(RECOVERY_STATES),
  completedMilestones: z.array(z.number().int()),
  blockedMilestones: z.array(z.number().int()),
  nextMilestone: z.object({ order: z.number().int().positive(), milestone: z.string().min(3), requiredEvidence: z.string().min(3) }).nullable(),
  requiredEvidence: z.array(z.string()),
  reassessmentRequirement: z.string().min(3),
  stabilizationGateStatus: z.enum(["OPEN", "BLOCKED"]),
  thriveGateStatus: z.enum(["ELIGIBLE", "BLOCKED"]),
  regressionDetected: z.boolean(),
  restructureOrShutdownRequired: z.boolean(),
  ownerApprovalRequired: z.boolean(),
  managerStaffActions: z.array(z.string()),
  blockedUnsafeActions: z.array(z.string()),
  cockpitSummary: noMoney.pipe(z.string().min(3)),
  auditTrace: z.array(z.string()).min(1),
})
  // The thrive gate can be ELIGIBLE only when stabilization is OPEN (proven) — never before.
  .refine((v) => v.thriveGateStatus !== "ELIGIBLE" || v.stabilizationGateStatus === "OPEN", {
    message: "thrive gate can be eligible only after the stabilization gate opens (no premature growth)",
  })
  // Stabilization OPEN requires every milestone proven (no skipped milestone).
  .refine((v) => v.stabilizationGateStatus !== "OPEN" || v.blockedMilestones.length === 0, {
    message: "the stabilization gate cannot open while any milestone is still blocked",
  })
  // An unrecoverable/restructure state must keep the thrive gate blocked and flag restructure/shutdown.
  .refine((v) => !(v.currentRecoveryState === "RESTRUCTURE_REVIEW_REQUIRED" || v.currentRecoveryState === "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED")
    || (v.restructureOrShutdownRequired && v.thriveGateStatus === "BLOCKED"), {
    message: "a restructure/shutdown state must flag restructure and keep the thrive gate blocked (no fake recovery)",
  });

/**
 * Compute the current recovery execution view. Returns null when there is no plan to recover (a clean control:
 * the survival planner returned no plan).
 */
export function computeRecoveryExecution(input: RecoveryInput | { recoveryCaseId: string; workspaceArchetype: PublicArchetype; plan: null }): RecoveryExecutionView | null {
  const plan = input.plan;
  if (!plan) return null;
  const outcomes = ("outcomes" in input ? input.outcomes : undefined) ?? [];
  const trace: string[] = [`recovery:${input.recoveryCaseId}`, `from-plan:${plan.crisisStatus}`];
  const blockedUnsafeActions = plan.blockedUnsafeActions;
  const managerStaffActions = plan.managerStaffTasks;
  const milestones = plan.recoveryMilestones;
  const byOrder = new Map<number, MilestoneOutcome>(outcomes.map((o) => [o.order, o]));

  // ── Unrecoverable: keep restructure/controlled-shutdown review active; never fake recovery. ──
  if (plan.unrecoverableRiskAssessment.unrecoverable) {
    const shutdown = plan.unrecoverableRiskAssessment.options.some((o) => /shutdown/i.test(o))
      && !plan.unrecoverableRiskAssessment.options.some((o) => /restructure/i.test(o));
    const state: RecoveryState = shutdown ? "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED" : "RESTRUCTURE_REVIEW_REQUIRED";
    trace.push(`unrecoverable:${state}`);
    return {
      recoveryCaseId: input.recoveryCaseId, workspaceArchetype: input.workspaceArchetype,
      currentRecoveryState: state, completedMilestones: [], blockedMilestones: milestones.map((m) => m.order),
      nextMilestone: null,
      requiredEvidence: ["the owner + an independent advisor decide restructure vs controlled shutdown", "verified cash runway", "any feasible near-term revenue", "available owner capital"],
      reassessmentRequirement: "Recovery is not attempted while unrecoverable; reassess only if the constraints change.",
      stabilizationGateStatus: "BLOCKED", thriveGateStatus: "BLOCKED",
      regressionDetected: false, restructureOrShutdownRequired: true, ownerApprovalRequired: true,
      managerStaffActions: [], blockedUnsafeActions,
      cockpitSummary: `Recovery not attempted: ${state}. Survival is not feasible under current constraints — the owner/expert decides restructure vs controlled shutdown. No recovery is faked and no growth is possible.`,
      auditTrace: trace,
    };
  }

  // ── Walk milestones in strict order; the first not-proven one is the next bottleneck. ──
  const completed: number[] = [];
  let regressed = false;
  let nextOrder: number | null = null;
  for (const m of milestones) {
    const o = byOrder.get(m.order);
    const executedWithEvidence = !!o && o.executed && o.evidenceProvided;
    if (executedWithEvidence && NEEDS_REASSESSMENT.has(m.order) && o!.reassessment === "WORSENED") {
      regressed = true; nextOrder = m.order; break;
    }
    const proven = executedWithEvidence && (NEEDS_REASSESSMENT.has(m.order) ? o!.reassessment === "IMPROVED" : true);
    if (proven) { completed.push(m.order); continue; }
    nextOrder = m.order; break;
  }
  const blockedMilestones = milestones.map((m) => m.order).filter((ord) => !completed.includes(ord));
  const allProven = blockedMilestones.length === 0;

  let currentRecoveryState: RecoveryState;
  if (regressed) {
    currentRecoveryState = "RECOVERY_REGRESSED";
    trace.push(`regressed-at:${nextOrder}`);
  } else if (allProven) {
    currentRecoveryState = "THRIVE_GATE_ELIGIBLE";
    trace.push("stabilization-proven:thrive-eligible");
  } else if (completed.length === 0 && (byOrder.size === 0)) {
    currentRecoveryState = "CRISIS_IDENTIFIED";
    trace.push("crisis-identified:no-milestone-started");
  } else {
    currentRecoveryState = PENDING_STATE[nextOrder ?? 1] ?? "UNKNOWN_NEEDS_DATA";
    trace.push(`pending:${currentRecoveryState}`);
  }

  const stabilizationGateStatus: "OPEN" | "BLOCKED" = allProven ? "OPEN" : "BLOCKED";
  const thriveGateStatus: "ELIGIBLE" | "BLOCKED" = allProven ? "ELIGIBLE" : "BLOCKED";
  const nextM = nextOrder != null ? milestones.find((m) => m.order === nextOrder) ?? null : null;
  const nextMilestone = regressed && nextM
    ? { order: nextM.order, milestone: `Re-correct (reassessment worsened): ${nextM.milestone}`, requiredEvidence: nextM.evidenceRequired }
    : nextM
      ? { order: nextM.order, milestone: nextM.milestone, requiredEvidence: nextM.evidenceRequired }
      : null;

  const reassessmentRequirement = allProven
    ? "All milestones are reassessed and passing; the stabilization gate is open."
    : `The next milestone must be executed with evidence${NEEDS_REASSESSMENT.has(nextOrder ?? 0) ? " and pass a governed reassessment (improved, not worsened)" : ""} before recovery advances.`;

  const cockpitSummary = regressed
    ? `Recovery regressed: a completed milestone's reassessment worsened — loop back to re-correct it. Growth stays blocked; nothing is auto-executed.`
    : allProven
      ? `Stabilization proven: every milestone passed with evidence and reassessment. The thrive/growth gate is now ELIGIBLE — but only with owner approval and evidence; nothing is auto-executed.`
      : `Next bottleneck: ${nextMilestone?.milestone ?? "unknown"} (milestone ${nextOrder}). Prior milestones are proven; this one needs evidence before recovery advances. Growth stays blocked until stabilization is proven.`;

  return {
    recoveryCaseId: input.recoveryCaseId, workspaceArchetype: input.workspaceArchetype,
    currentRecoveryState, completedMilestones: completed, blockedMilestones,
    nextMilestone,
    requiredEvidence: nextMilestone ? [nextMilestone.requiredEvidence] : [],
    reassessmentRequirement, stabilizationGateStatus, thriveGateStatus,
    regressionDetected: regressed, restructureOrShutdownRequired: false,
    ownerApprovalRequired: thriveGateStatus === "ELIGIBLE" || plan.survivalTopAction.ownerApprovalRequired,
    managerStaffActions, blockedUnsafeActions,
    cockpitSummary, auditTrace: trace,
  };
}

/** Compute AND validate — an incoherent recovery view can never reach the owner cockpit / governed path. */
export function computeAndValidateRecovery(
  input: RecoveryInput | { recoveryCaseId: string; workspaceArchetype: PublicArchetype; plan: null },
): { ok: true; view: RecoveryExecutionView } | { ok: false; issues: string[] } | { ok: true; view: null } {
  const view = computeRecoveryExecution(input);
  if (view === null) return { ok: true, view: null };
  const parsed = recoveryExecutionViewSchema.safeParse(view);
  if (parsed.success) return { ok: true, view };
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return { ok: false, issues };
}
