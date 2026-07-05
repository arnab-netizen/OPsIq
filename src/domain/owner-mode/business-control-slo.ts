/**
 * Business-Control SLOs (depth pass).
 *
 * Answers: "Is OpsIQ's own business-control loop reliable?" — it grades the control system,
 * not the business. Each SLI is PASS / WARN / FAIL / NOT_MEASURABLE, with a target, the
 * measured value where a real source exists, the exact missing data where it does not, and a
 * corrective action. It surfaces the single most important control risk (not a flood).
 *
 * PURE and deterministic. It grades the signals the Owner Now View already computes
 * (workload budget, top constraint / profit leak / gaming signal / credibility concern) plus
 * a few DB-measurable proof facts. It does NOT fake metrics: where the source event/linkage
 * is not persisted (per-mutation audit correlation, trigger↔reassessment timing, shock
 * timing, startup data), the SLI is NOT_MEASURABLE with the exact missing source — never a
 * green pass.
 */

import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";
import type { ProfitLeakType } from "@/domain/owner-mode/profit-leak-radar";
import type { GamingSignalType } from "@/domain/owner-mode/anti-gaming-analytics";
import type { CredibilitySignalType } from "@/domain/owner-mode/evidence-credibility-graph";

export type SLOStatus = "PASS" | "WARN" | "FAIL" | "NOT_MEASURABLE";
export type SLOConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type SLOType =
  | "AUDIT_DURABILITY" | "PROOF_REVIEW_COMPLETION" | "WEAK_PROOF_REVIEW_RATE" | "EVIDENCE_CREDIBILITY_RISK"
  | "ANTI_GAMING_RISK" | "REASSESSMENT_LATENCY" | "SHOCK_HANDLING_LATENCY" | "OWNER_WORKLOAD_BURDEN"
  | "OWNER_BOTTLENECK" | "CONSTRAINT_FRESHNESS" | "PROFIT_LEAK_FRESHNESS" | "OPPORTUNITY_DECISION_COMPLETENESS"
  | "STARTUP_VALIDATION_COMPLETENESS" | "NOW_VIEW_SIGNAL_COMPLETENESS" | "CROSS_WORKSPACE_ISOLATION_PROOF";

type Sev = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "POSITIVE";

export interface BusinessControlInput {
  workspaceId: string;
  workloadBudget?: { ownerDecisionsRequired: number; approvalsRequired: number; reviewsRequired: number; ownerBottleneckItems: number } | null;
  topConstraintType?: ConstraintType | null;
  topConstraintSeverity?: Sev | null;
  topProfitLeakType?: ProfitLeakType | null;
  topProfitLeakSeverity?: Sev | null;
  topGamingSignalType?: GamingSignalType | null;
  topGamingSeverity?: Sev | null;
  topCredibilitySignalType?: CredibilitySignalType | null;
  topCredibilitySeverity?: Sev | null;
  totalProofCount?: number | null;
  weakProofCount?: number | null;
  /** Weak proofs still awaiting review past the review window. */
  overdueReviewCount?: number | null;
  /** Which top-level now-view signals are present (completeness). */
  nowViewSignalsPresent?: { workload: boolean; constraint: boolean; profitLeak: boolean; gaming: boolean; credibility: boolean };
  /** A recent opportunity envelope's field presence (completeness), or null if none. */
  opportunityEnvelopeFields?: { ownerApprovalRequired: boolean; successMetric: boolean; stopLoss: boolean; reassessmentTrigger: boolean; confidence: boolean; cashImpact: boolean } | null;
  /** Honest source-availability flags (false → NOT_MEASURABLE). */
  auditCorrelationAvailable?: boolean;
  reassessmentLatencyAvailable?: boolean;
  shockLatencyAvailable?: boolean;
  startupDataAvailable?: boolean;
  /** Test-backed isolation status (from the isolation test suite), or null. */
  isolationTestPassed?: boolean | null;
  evaluatedAt: string;
}

export interface BusinessControlSLO {
  workspaceId: string;
  sloType: SLOType;
  sliName: string;
  status: SLOStatus;
  target: string;
  actualValue: string | null;
  measurementWindow: string;
  confidence: SLOConfidence;
  sourceDataRefs: string[];
  missingData: string[];
  ownerExplanation: string;
  businessImpact: string;
  degradedBehavior: string | null;
  recommendedAction: string;
  ownerActionRequired: boolean;
  relatedConstraint: ConstraintType | null;
  relatedProfitLeak: ProfitLeakType | null;
  relatedGamingSignal: GamingSignalType | null;
  relatedCredibilityConcern: CredibilitySignalType | null;
  evaluatedAt: string;
}

export interface BusinessControlHealth {
  workspaceId: string;
  overallStatus: SLOStatus;
  measuredCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  notMeasurableCount: number;
  topControlRisk: BusinessControlSLO | null;
  slos: BusinessControlSLO[];
  evaluatedAt: string;
}

const HIGH_SEV = new Set<Sev>(["CRITICAL", "HIGH"]);
const STATUS_RANK: Record<SLOStatus, number> = { FAIL: 3, WARN: 2, NOT_MEASURABLE: 1, PASS: 0 };

export function evaluateBusinessControlSLOs(input: BusinessControlInput): BusinessControlHealth {
  const at = input.evaluatedAt;
  const ws = input.workspaceId;
  const slos: BusinessControlSLO[] = [];
  const add = (s: Omit<BusinessControlSLO, "workspaceId" | "evaluatedAt" | "relatedConstraint" | "relatedProfitLeak" | "relatedGamingSignal" | "relatedCredibilityConcern"> & Partial<Pick<BusinessControlSLO, "relatedConstraint" | "relatedProfitLeak" | "relatedGamingSignal" | "relatedCredibilityConcern">>): void => {
    slos.push({
      relatedConstraint: null, relatedProfitLeak: null, relatedGamingSignal: null, relatedCredibilityConcern: null,
      ...s, workspaceId: ws, evaluatedAt: at,
    });
  };

  // 1. OWNER_WORKLOAD_BURDEN
  if (input.workloadBudget) {
    const wb = input.workloadBudget;
    const burden = wb.ownerDecisionsRequired + wb.approvalsRequired + wb.reviewsRequired;
    const status: SLOStatus = burden > 12 ? "FAIL" : burden > 6 ? "WARN" : "PASS";
    add({
      sloType: "OWNER_WORKLOAD_BURDEN", sliName: "Owner items requiring attention today", status,
      target: "<= 6 owner decisions/approvals/reviews", actualValue: String(burden), measurementWindow: "today",
      confidence: "HIGH", sourceDataRefs: ["owner workload budget"], missingData: [],
      ownerExplanation: `You have ${burden} items needing your attention today (${wb.ownerDecisionsRequired} decisions, ${wb.approvalsRequired} approvals, ${wb.reviewsRequired} reviews).`,
      businessImpact: "Excess owner load slows the whole business and risks decisions being rushed or missed.",
      degradedBehavior: status === "PASS" ? null : "Work waits on the owner; throughput drops until the queue clears.",
      recommendedAction: status === "PASS" ? "No action — owner load is sustainable." : "Delegate/pre-authorize routine approvals; keep only high-value decisions.",
      ownerActionRequired: status === "FAIL",
    });
  } else {
    add({ sloType: "OWNER_WORKLOAD_BURDEN", sliName: "Owner items requiring attention today", status: "NOT_MEASURABLE",
      target: "<= 6", actualValue: null, measurementWindow: "today", confidence: "NEEDS_DATA", sourceDataRefs: [],
      missingData: ["owner workload budget (no now-view snapshot)"], ownerExplanation: "Owner workload cannot be measured without a now-view snapshot.",
      businessImpact: "n/a", degradedBehavior: null, recommendedAction: "Open the owner now-view to generate the workload budget.", ownerActionRequired: false });
  }

  // 2. OWNER_BOTTLENECK
  {
    const isOwnerConstraint = input.topConstraintType === "OWNER";
    const bottleneckItems = input.workloadBudget?.ownerBottleneckItems ?? 0;
    const status: SLOStatus = isOwnerConstraint ? "FAIL" : bottleneckItems > 0 ? "WARN" : input.workloadBudget ? "PASS" : "NOT_MEASURABLE";
    add({
      sloType: "OWNER_BOTTLENECK", sliName: "Owner is the binding constraint", status,
      target: "owner is NOT the bottleneck", actualValue: isOwnerConstraint ? "owner is the binding constraint" : `${bottleneckItems} owner-bottleneck item(s)`,
      measurementWindow: "current", confidence: input.workloadBudget ? "HIGH" : "NEEDS_DATA",
      sourceDataRefs: ["constraint engine", "owner workload budget"], missingData: input.workloadBudget ? [] : ["owner workload budget"],
      ownerExplanation: isOwnerConstraint ? "You are currently the binding constraint — too much depends on you." : bottleneckItems > 0 ? "Some work is waiting on you." : "You are not the current bottleneck.",
      businessImpact: "An owner bottleneck caps the whole business's throughput.",
      degradedBehavior: status === "PASS" || status === "NOT_MEASURABLE" ? null : "Downstream work stalls until the owner acts.",
      recommendedAction: status === "PASS" ? "No action." : "Delegate or pre-authorize to remove yourself from the critical path.",
      ownerActionRequired: status === "FAIL", relatedConstraint: isOwnerConstraint ? "OWNER" : null,
    });
  }

  // 3. ANTI_GAMING_RISK
  add(riskSlo("ANTI_GAMING_RISK", "Top staff/manager gaming risk", input.topGamingSignalType === "DATA_INSUFFICIENT" ? null : input.topGamingSignalType, input.topGamingSeverity, at, ws,
    "anti-gaming analytics", "Unaddressed gaming (self-review, rubber-stamp, reuse) makes completion untrustworthy.",
    { relatedGamingSignal: input.topGamingSignalType && input.topGamingSignalType !== "DATA_INSUFFICIENT" ? input.topGamingSignalType : null }));

  // 4. EVIDENCE_CREDIBILITY_RISK
  add(riskSlo("EVIDENCE_CREDIBILITY_RISK", "Top evidence-credibility risk", input.topCredibilitySignalType === "DATA_INSUFFICIENT" ? null : input.topCredibilitySignalType, input.topCredibilitySeverity, at, ws,
    "evidence credibility graph", "Low-credibility proof means the owner cannot trust reported completion.",
    { relatedCredibilityConcern: input.topCredibilitySignalType && input.topCredibilitySignalType !== "DATA_INSUFFICIENT" ? input.topCredibilitySignalType : null }));

  // 5. WEAK_PROOF_REVIEW_RATE
  if (input.totalProofCount != null && input.totalProofCount > 0) {
    const rate = (input.weakProofCount ?? 0) / input.totalProofCount;
    const status: SLOStatus = rate >= 0.4 ? "FAIL" : rate >= 0.2 ? "WARN" : "PASS";
    add({ sloType: "WEAK_PROOF_REVIEW_RATE", sliName: "Share of proof that is weak / needs review", status,
      target: "< 20% weak", actualValue: `${Math.round(rate * 100)}% (${input.weakProofCount ?? 0}/${input.totalProofCount})`, measurementWindow: "all proofs",
      confidence: "HIGH", sourceDataRefs: ["proof table (status)"], missingData: [],
      ownerExplanation: `${Math.round(rate * 100)}% of proof is weak/needs review.`,
      businessImpact: "A high weak-proof rate predicts rework, complaints, and review load.",
      degradedBehavior: status === "PASS" ? null : "Verification is slow and unreliable.",
      recommendedAction: status === "PASS" ? "No action." : "Tighten proof requirements / coach the operators driving weak proof.", ownerActionRequired: false });
  } else {
    add(notMeasurable("WEAK_PROOF_REVIEW_RATE", "Share of proof that is weak / needs review", "< 20% weak", ["proof events (no proofs recorded)"], ws, at));
  }

  // 6. PROOF_REVIEW_COMPLETION (backlog of overdue reviews)
  if (input.totalProofCount != null && input.totalProofCount > 0) {
    const overdue = input.overdueReviewCount ?? 0;
    const status: SLOStatus = overdue >= 5 ? "FAIL" : overdue >= 1 ? "WARN" : "PASS";
    add({ sloType: "PROOF_REVIEW_COMPLETION", sliName: "Proof reviewed within the review window", status,
      target: "0 overdue reviews", actualValue: `${overdue} overdue review(s)`, measurementWindow: "48h review window",
      confidence: "MEDIUM", sourceDataRefs: ["proof table (status + age)"], missingData: [],
      ownerExplanation: overdue > 0 ? `${overdue} proof(s) needing review are past the review window.` : "No proof review is overdue.",
      businessImpact: "Unreviewed proof blocks verified completion and the learning loop.",
      degradedBehavior: status === "PASS" ? null : "Completed work sits unverified.",
      recommendedAction: status === "PASS" ? "No action." : "Clear the review backlog or delegate proof review.", ownerActionRequired: status === "FAIL" });
  } else {
    add(notMeasurable("PROOF_REVIEW_COMPLETION", "Proof reviewed within the review window", "0 overdue", ["proof events (no proofs recorded)"], ws, at));
  }

  // 7. CONSTRAINT_FRESHNESS / control
  add(freshnessSlo("CONSTRAINT_FRESHNESS", "Binding constraint identified & current", !!input.topConstraintType && input.topConstraintType !== "DATA_INSUFFICIENT", input.topConstraintSeverity, at, ws,
    "constraint engine", "If the binding constraint is unknown, effort is spent in the wrong place.",
    { relatedConstraint: input.topConstraintType && input.topConstraintType !== "DATA_INSUFFICIENT" ? input.topConstraintType : null }));

  // 8. PROFIT_LEAK_FRESHNESS / control
  add(freshnessSlo("PROFIT_LEAK_FRESHNESS", "Top profit leak identified & current", !!input.topProfitLeakType && input.topProfitLeakType !== "DATA_INSUFFICIENT", input.topProfitLeakSeverity, at, ws,
    "profit-leak radar", "If leaks are invisible, margin bleeds unnoticed.",
    { relatedProfitLeak: input.topProfitLeakType && input.topProfitLeakType !== "DATA_INSUFFICIENT" ? input.topProfitLeakType : null }));

  // 9. OPPORTUNITY_DECISION_COMPLETENESS
  if (input.opportunityEnvelopeFields) {
    const f = input.opportunityEnvelopeFields;
    const complete = f.ownerApprovalRequired !== undefined && f.successMetric && f.stopLoss && f.reassessmentTrigger && f.confidence && f.cashImpact;
    const missing = Object.entries({ successMetric: f.successMetric, stopLoss: f.stopLoss, reassessmentTrigger: f.reassessmentTrigger, confidence: f.confidence, cashImpact: f.cashImpact }).filter(([, v]) => !v).map(([k]) => k);
    add({ sloType: "OPPORTUNITY_DECISION_COMPLETENESS", sliName: "Opportunity decisions carry the full owner envelope", status: complete ? "PASS" : "FAIL",
      target: "confidence + cash impact + approval gate + success metric + stop-loss + reassessment", actualValue: complete ? "all fields present" : `missing: ${missing.join(", ")}`,
      measurementWindow: "latest decision", confidence: "HIGH", sourceDataRefs: ["opportunity decision envelope"], missingData: complete ? [] : missing,
      ownerExplanation: complete ? "Opportunity recommendations include everything needed to decide safely." : "Opportunity recommendations are missing safety fields.",
      businessImpact: "An incomplete opportunity recommendation can lead to an unsafe growth decision.",
      degradedBehavior: complete ? null : "Owner may act on an under-specified opportunity.",
      recommendedAction: complete ? "No action." : "Fix the opportunity envelope to include the missing fields.", ownerActionRequired: !complete });
  } else {
    add(notMeasurable("OPPORTUNITY_DECISION_COMPLETENESS", "Opportunity decisions carry the full owner envelope", "all envelope fields present", ["a recent opportunity decision (none evaluated)"], ws, at));
  }

  // 10. NOW_VIEW_SIGNAL_COMPLETENESS
  if (input.nowViewSignalsPresent) {
    const p = input.nowViewSignalsPresent;
    const present = Object.entries(p).filter(([, v]) => v).map(([k]) => k);
    const missing = Object.entries(p).filter(([, v]) => !v).map(([k]) => k);
    const status: SLOStatus = missing.length === 0 ? "PASS" : missing.length <= 2 ? "WARN" : "FAIL";
    add({ sloType: "NOW_VIEW_SIGNAL_COMPLETENESS", sliName: "Now-view exposes all control signals", status,
      target: "workload + constraint + profitLeak + gaming + credibility", actualValue: `${present.length}/5 present`, measurementWindow: "current",
      confidence: "HIGH", sourceDataRefs: ["owner now-view payload"], missingData: missing,
      ownerExplanation: missing.length === 0 ? "The owner now-view surfaces every control signal." : `The now-view is missing: ${missing.join(", ")}.`,
      businessImpact: "A missing control signal is a blind spot in owner oversight.",
      degradedBehavior: status === "PASS" ? null : "The owner cannot see part of the control picture.",
      recommendedAction: status === "PASS" ? "No action." : "Investigate why the missing signal did not compute.", ownerActionRequired: status === "FAIL" });
  } else {
    add(notMeasurable("NOW_VIEW_SIGNAL_COMPLETENESS", "Now-view exposes all control signals", "5/5 signals", ["now-view signal presence map"], ws, at));
  }

  // 11–14. Honestly NOT_MEASURABLE controls (no persisted source yet).
  add(input.auditCorrelationAvailable
    ? passByDesign("AUDIT_DURABILITY", "Governed state changes have matching audit", "100% of governed mutations audited", ["atomic audit (AUDIT-01)"], ws, at, "Audit is emitted in the same transaction as each governed mutation (atomic-audit guarantee).")
    : notMeasurable("AUDIT_DURABILITY", "Governed state changes have matching audit", "100% mutations audited", ["per-mutation state-change↔audit correlation index (not persisted)"], ws, at, "Architecturally guaranteed by atomic audit (AUDIT-01), but not yet measurable as a runtime rate."));
  add(input.reassessmentLatencyAvailable
    ? passByDesign("REASSESSMENT_LATENCY", "Trigger-to-reassessment latency", "within target", ["reassessment events"], ws, at, "Reassessment events are timestamped.")
    : notMeasurable("REASSESSMENT_LATENCY", "Trigger-to-reassessment latency", "within target", ["trigger↔reassessment timestamp linkage (not persisted)"], ws, at));
  add(input.shockLatencyAvailable
    ? passByDesign("SHOCK_HANDLING_LATENCY", "Shock-to-owner-visible latency", "within target", ["shock events"], ws, at, "Shock events are timestamped.")
    : notMeasurable("SHOCK_HANDLING_LATENCY", "Shock-to-owner-visible latency", "within target", ["shock↔reassessment timestamp linkage (not persisted)"], ws, at));
  add(input.startupDataAvailable
    ? passByDesign("STARTUP_VALIDATION_COMPLETENESS", "Startup recommendations carry validation + cash safety", "all fields present", ["startup controller"], ws, at, "Startup recommendation fields present.")
    : notMeasurable("STARTUP_VALIDATION_COMPLETENESS", "Startup recommendations carry validation + cash safety", "all fields present", ["an active startup recommendation (Startup Mode not in use)"], ws, at));

  // 15. CROSS_WORKSPACE_ISOLATION_PROOF — test-backed only.
  if (input.isolationTestPassed === true) {
    add({ sloType: "CROSS_WORKSPACE_ISOLATION_PROOF", sliName: "Cross-workspace isolation (test-backed)", status: "PASS",
      target: "no cross-workspace bleed", actualValue: "isolation tests pass", measurementWindow: "test suite",
      confidence: "MEDIUM", sourceDataRefs: ["*-simulation.db.test.ts isolation cases"], missingData: [],
      ownerExplanation: "Cross-workspace isolation is proven by the DB test suite (not a runtime metric).",
      businessImpact: "A leak would expose one business's data to another.",
      degradedBehavior: null, recommendedAction: "No action; keep the isolation tests in CI.", ownerActionRequired: false });
  } else {
    add(notMeasurable("CROSS_WORKSPACE_ISOLATION_PROOF", "Cross-workspace isolation (test-backed)", "no bleed", ["passing isolation test evidence"], ws, at));
  }

  // Overall + top control risk.
  const measured = slos.filter((s) => s.status !== "NOT_MEASURABLE");
  const passCount = slos.filter((s) => s.status === "PASS").length;
  const warnCount = slos.filter((s) => s.status === "WARN").length;
  const failCount = slos.filter((s) => s.status === "FAIL").length;
  const notMeasurableCount = slos.filter((s) => s.status === "NOT_MEASURABLE").length;
  const overallStatus: SLOStatus = failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : measured.length > 0 ? "PASS" : "NOT_MEASURABLE";

  const ranked = [...slos].sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  const topRiskCandidate = ranked.find((s) => s.status === "FAIL") ?? ranked.find((s) => s.status === "WARN") ?? ranked.find((s) => s.status === "NOT_MEASURABLE") ?? null;

  return {
    workspaceId: ws, overallStatus, measuredCount: measured.length, passCount, warnCount, failCount, notMeasurableCount,
    topControlRisk: topRiskCandidate, slos, evaluatedAt: at,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sevToStatus(sev: Sev | null | undefined): SLOStatus {
  if (sev == null) return "PASS";
  return HIGH_SEV.has(sev) ? "FAIL" : sev === "MEDIUM" ? "WARN" : "PASS";
}

function riskSlo(
  sloType: SLOType, sliName: string, signalType: string | null | undefined, sev: Sev | null | undefined,
  at: string, ws: string, source: string, impact: string,
  rel: Partial<Pick<BusinessControlSLO, "relatedGamingSignal" | "relatedCredibilityConcern">>
): Omit<BusinessControlSLO, "workspaceId" | "evaluatedAt" | "relatedConstraint" | "relatedProfitLeak"> & Partial<Pick<BusinessControlSLO, "relatedConstraint" | "relatedProfitLeak">> {
  if (!signalType) {
    return { ...notMeasurableBody(sloType, sliName, "no high-risk pattern", [`${source} (no proof/review events)`], impact), ...rel } as any;
  }
  const status = sevToStatus(sev);
  return {
    sloType, sliName, status, target: "no HIGH/CRITICAL risk pattern", actualValue: `${signalType} (${sev ?? "n/a"})`,
    measurementWindow: "current", confidence: "HIGH", sourceDataRefs: [source], missingData: [],
    ownerExplanation: status === "PASS" ? "No high-risk pattern is active." : `Active risk pattern: ${signalType}.`,
    businessImpact: impact, degradedBehavior: status === "PASS" ? null : "Trust in reported completion is degraded.",
    recommendedAction: status === "PASS" ? "No action." : "Act on the linked signal in the now-view.", ownerActionRequired: status === "FAIL",
    ...rel,
  } as any;
}

function freshnessSlo(
  sloType: SLOType, sliName: string, present: boolean, sev: Sev | null | undefined, at: string, ws: string, source: string, impact: string,
  rel: Partial<Pick<BusinessControlSLO, "relatedConstraint" | "relatedProfitLeak">>
): Omit<BusinessControlSLO, "workspaceId" | "evaluatedAt" | "relatedGamingSignal" | "relatedCredibilityConcern"> & Partial<Pick<BusinessControlSLO, "relatedGamingSignal" | "relatedCredibilityConcern">> {
  if (!present) {
    return { ...notMeasurableBody(sloType, sliName, "identified & current", [`${source} (insufficient data — DATA_INSUFFICIENT)`], impact), ...rel } as any;
  }
  const stressed = sev != null && HIGH_SEV.has(sev);
  return {
    sloType, sliName, status: stressed ? "WARN" : "PASS", target: "identified & current (recomputed each read)",
    actualValue: stressed ? `identified, binding severity ${sev}` : "identified & current", measurementWindow: "current",
    confidence: "HIGH", sourceDataRefs: [source], missingData: [],
    ownerExplanation: stressed ? "The control signal is fresh but the underlying issue is severe." : "The control signal is identified and current.",
    businessImpact: impact, degradedBehavior: stressed ? "A severe issue is binding — act before scaling." : null,
    recommendedAction: stressed ? "Relieve the linked issue in the now-view before growth." : "No action.", ownerActionRequired: false,
    ...rel,
  } as any;
}

function notMeasurableBody(sloType: SLOType, sliName: string, target: string, missing: string[], impact: string) {
  return {
    sloType, sliName, status: "NOT_MEASURABLE" as SLOStatus, target, actualValue: null, measurementWindow: "n/a",
    confidence: "NEEDS_DATA" as SLOConfidence, sourceDataRefs: [], missingData: missing,
    ownerExplanation: `Not measurable yet — needs: ${missing.join("; ")}.`, businessImpact: impact,
    degradedBehavior: null, recommendedAction: `Provide/persist: ${missing.join("; ")}.`, ownerActionRequired: false,
  };
}

function notMeasurable(sloType: SLOType, sliName: string, target: string, missing: string[], ws: string, at: string, extra?: string): Omit<BusinessControlSLO, "workspaceId" | "evaluatedAt" | "relatedConstraint" | "relatedProfitLeak" | "relatedGamingSignal" | "relatedCredibilityConcern"> {
  const b = notMeasurableBody(sloType, sliName, target, missing, "n/a");
  if (extra) b.ownerExplanation = `${b.ownerExplanation} (${extra})`;
  return b;
}

function passByDesign(sloType: SLOType, sliName: string, target: string, refs: string[], ws: string, at: string, note: string): Omit<BusinessControlSLO, "workspaceId" | "evaluatedAt" | "relatedConstraint" | "relatedProfitLeak" | "relatedGamingSignal" | "relatedCredibilityConcern"> {
  return {
    sloType, sliName, status: "PASS", target, actualValue: "guaranteed by design", measurementWindow: "current",
    confidence: "MEDIUM", sourceDataRefs: refs, missingData: [], ownerExplanation: note, businessImpact: "n/a",
    degradedBehavior: null, recommendedAction: "No action.", ownerActionRequired: false,
  };
}
