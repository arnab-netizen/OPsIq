/**
 * Slice 10 — temporal outcome validation.
 *
 * OpsIQ must not declare success at recommendation time; it sets measurable outcome checkpoints
 * (7/14/30/60/90 days) and validates whether the advice actually worked. A failed checkpoint
 * triggers reassessment + an after-action review (AAR) + a learning artifact + a do-not-repeat
 * condition, so the NEXT recommendation changes and the failed action is suppressed. A successful
 * checkpoint reinforces the playbook.
 */
import { abstractedLocationKey } from "../locations";
import { learningArtifactSchema, type BehavioralCase, type LearningArtifact } from "../schema";
import type { LearningStore } from "../learning-store";

export const CHECKPOINT_DAYS = [7, 14, 30, 60, 90] as const;
export type CheckpointDay = (typeof CHECKPOINT_DAYS)[number];

export interface OutcomeCheckpoint {
  day: CheckpointDay;
  metric: string;
  expectedMovement: "up" | "down" | "stable";
  acceptableRangePct: [number, number]; // acceptable % change band for the metric
  failureCondition: string;
  reassessmentTrigger: string;
  nextActionIfImproving: string;
  nextActionIfFailing: string;
  learningArtifactIfFailed: string; // corrected-behavior text persisted on failure
  doNotRepeatCondition: string;
}

function metricsFor(c: BehavioralCase): Array<{ metric: string; movement: "up" | "down" }> {
  const m: Array<{ metric: string; movement: "up" | "down" }> = [];
  if (c.flags.cashRisk) m.push({ metric: "cash balance", movement: "up" }, { metric: "contribution margin", movement: "up" });
  if (c.flags.capacityRisk) m.push({ metric: "rework/complaint rate", movement: "down" });
  m.push({ metric: "owner hours on routine checks", movement: "down" });
  if (m.length < CHECKPOINT_DAYS.length) m.push({ metric: "net monthly profit", movement: "up" });
  return m;
}

export function createCheckpoints(c: BehavioralCase): OutcomeCheckpoint[] {
  const metrics = metricsFor(c);
  return CHECKPOINT_DAYS.map((day, i) => {
    const { metric, movement } = metrics[i % metrics.length];
    return {
      day,
      metric,
      expectedMovement: movement,
      acceptableRangePct: movement === "up" ? [5, 100] : [-100, -5],
      failureCondition: `${metric} did not move ${movement} by day ${day}`,
      reassessmentTrigger: `Reassess at day ${day}: if ${metric} is outside the acceptable band, escalate cadence and re-diagnose.`,
      nextActionIfImproving: `Hold the plan; continue measuring ${metric} and prepare the next staged step.`,
      nextActionIfFailing: `Stop the current action, re-diagnose the constraint, and do not repeat the failed move on ${metric}.`,
      learningArtifactIfFailed: `Action that failed to move ${metric} by day ${day} must not be repeated without a changed, evidence-backed rationale.`,
      doNotRepeatCondition: `Do not repeat the same action expecting ${metric} to move ${movement} without new evidence.`,
    };
  });
}

export interface CheckpointResult {
  day: CheckpointDay;
  metric: string;
  observedChangePct: number;
  passed: boolean;
  status: "improving" | "failing";
}

export function evaluateCheckpoint(cp: OutcomeCheckpoint, observedChangePct: number): CheckpointResult {
  const [lo, hi] = cp.acceptableRangePct;
  const passed = observedChangePct >= lo && observedChangePct <= hi;
  return { day: cp.day, metric: cp.metric, observedChangePct, passed, status: passed ? "improving" : "failing" };
}

export interface AfterActionReview {
  caseId: string;
  day: CheckpointDay;
  metric: string;
  failedAction: string;
  observedChangePct: number;
  rootCauseOfFailure: string;
  doNotRepeat: string;
}

export function buildAAR(c: BehavioralCase, cp: OutcomeCheckpoint, failedAction: string, observedChangePct: number): AfterActionReview {
  return {
    caseId: c.id,
    day: cp.day,
    metric: cp.metric,
    failedAction,
    observedChangePct,
    rootCauseOfFailure: `The action did not move ${cp.metric} into the acceptable band — the assumed lever was wrong or insufficient.`,
    doNotRepeat: cp.doNotRepeatCondition,
  };
}

export function buildOutcomeArtifact(c: BehavioralCase, cp: OutcomeCheckpoint, opts: { workspaceId: string; actor: string; at: string }): LearningArtifact {
  return learningArtifactSchema.parse({
    id: `${c.id}::outcome-d${cp.day}::v1`,
    sourceCaseId: c.id,
    businessType: c.businessType,
    archetype: c.archetype,
    locationKey: abstractedLocationKey(c.location),
    failureLabel: "repeated_bad_advice",
    originalFailedBehavior: cp.failureCondition,
    correctedBehavior: cp.learningArtifactIfFailed,
    applicabilityScope: { archetype: c.archetype, decisionCategory: c.decisionCategory, locationKey: null },
    riskLevel: "medium",
    approvalStatus: "pending",
    scope: "local_only",
    privacyClassification: "workspace_private",
    workspaceId: opts.workspaceId,
    version: 1,
    supersededByVersion: null,
    active: true,
    createdAt: opts.at,
    auditTrail: [{ at: opts.at, actor: opts.actor, action: "created_from_failed_outcome" }],
  });
}

/** Do-not-repeat memory: a failed action is suppressed from future recommendations. */
export class DoNotRepeatLedger {
  private suppressed = new Map<string, Set<string>>();
  private key(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  suppress(workspaceId: string, action: string): void {
    const set = this.suppressed.get(workspaceId) ?? new Set<string>();
    set.add(this.key(action));
    this.suppressed.set(workspaceId, set);
  }
  isSuppressed(workspaceId: string, action: string): boolean {
    return this.suppressed.get(workspaceId)?.has(this.key(action)) ?? false;
  }
}

export interface OutcomeProcessResult {
  result: CheckpointResult;
  reinforcedPlaybook: boolean;
  aar: AfterActionReview | null;
  artifact: LearningArtifact | null;
}

/**
 * Process a checkpoint: on success reinforce; on failure produce an AAR + persist a learning artifact
 * and suppress the failed action so it is not repeated.
 */
export async function processCheckpoint(
  c: BehavioralCase,
  cp: OutcomeCheckpoint,
  observedChangePct: number,
  failedAction: string,
  store: LearningStore,
  ledger: DoNotRepeatLedger,
  opts: { workspaceId: string; actor: string; at: string },
): Promise<OutcomeProcessResult> {
  const result = evaluateCheckpoint(cp, observedChangePct);
  if (result.passed) return { result, reinforcedPlaybook: true, aar: null, artifact: null };
  const aar = buildAAR(c, cp, failedAction, observedChangePct);
  const artifact = buildOutcomeArtifact(c, cp, opts);
  await store.save(artifact);
  ledger.suppress(opts.workspaceId, failedAction);
  return { result, reinforcedPlaybook: false, aar, artifact };
}
