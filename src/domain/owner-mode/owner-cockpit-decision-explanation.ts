/**
 * Owner Cockpit Decision Explanation (PASS 31).
 *
 * A CONSERVATIVE, DETERMINISTIC layer that turns the PASS 30 prioritisation output into a COHERENT,
 * EVIDENCE-LINKED, owner-facing explanation for the single top action — so the owner understands what to do,
 * why it is top priority, what is verified vs unverified, what data is missing, why other issues rank lower,
 * what approval/evidence is required, what stays blocked, and what remains monitor-only.
 *
 * It re-derives NOTHING from raw text: it reads the interpreter → conflict → prioritisation outputs only.
 * It never fabricates certainty, never exposes a hidden score (owner sees reasons + a transparent tier),
 * never shows raw signal/PII/injection text, never implies OpsIQ has already executed anything, and never
 * states a financial result. It has NO execution authority — the governed bridge remains the authority.
 *
 * Pure + deterministic: no Date.now / Math.random / IO.
 */

import { z } from "zod";
import type { PublicArchetype } from "./public-signal-interpretation";
import { PUBLIC_ARCHETYPES } from "./public-signal-interpretation";
import type { PublicSignalPrioritisation, SignalTopic } from "./public-signal-prioritisation";
import type { ExecutionRoute } from "./process-execution-bridge";

export interface CockpitTopActionView {
  topic: SignalTopic;
  title: string;
  summary: string;
  executionRoute: ExecutionRoute;
  priorityTier: number;
  ownerApprovalRequired: boolean;
}

export interface SecondaryActionGroupView {
  topic: SignalTopic;
  priorityTier: number;
  signalCount: number;
  summary: string;
  ownerApprovalRequired: boolean;
}

export interface MonitorOnlyExplained {
  topic: SignalTopic;
  signalCount: number;
  whyNoAction: string;
}

/** The owner-facing explanation package for one workspace's top action. */
export interface OwnerCockpitExplanation {
  cockpitExplanationId: string;
  workspaceArchetype: PublicArchetype;
  topAction: CockpitTopActionView;
  explanationSummary: string;
  whyThisIsTopPriority: string[];
  supportingClusters: { topic: SignalTopic; signalCount: number }[];
  supportingSignalCount: number;
  strongestEvidence: string;
  weakestEvidence: string;
  verifiedFacts: string[];
  unverifiedSignals: string[];
  missingData: string[];
  riskIfIgnored: string;
  whyNotGrowthYet: string | null;
  ownerApprovalReason: string | null;
  requiredEvidenceBeforeCompletion: string[];
  reassessmentAfterCompletion: string;
  blockedUnsafeActions: string[];
  secondaryActionGroups: SecondaryActionGroupView[];
  monitorOnlySummary: MonitorOnlyExplained[];
  confidenceCaveat: string;
  ownerNextAction: string;
  managerStaffNextAction: string | null;
  safeCopy: string;
  auditTrace: string[];
}

// Strings that must NEVER appear in any owner-facing field (PII, injection, fabricated money).
const PII_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b\d[\d\s().-]{6,}\d\b|\bMr\.?\s+[A-Z][a-z]+/;
const INJECTION_RE = /ignore (?:all )?previous instructions|mark this business as verified/i;
const MONEY_RE = /[$£€]\s?\d|\b\d+(?:\.\d+)?\s?%|win probability|\bROI\b|\bMRR\b/i;

const cockpitStringSafe = z.string().refine((s) => !PII_RE.test(s) && !INJECTION_RE.test(s) && !MONEY_RE.test(s), {
  message: "owner-facing text must not contain PII, injected instructions, or a fabricated financial figure",
});

const secondarySchema = z.object({
  topic: z.string().min(1), priorityTier: z.number().int().min(1).max(9), signalCount: z.number().int().positive(),
  summary: cockpitStringSafe.pipe(z.string().min(3)), ownerApprovalRequired: z.boolean(),
});

export const ownerCockpitExplanationSchema = z.object({
  cockpitExplanationId: z.string().min(3),
  workspaceArchetype: z.enum(PUBLIC_ARCHETYPES),
  topAction: z.object({
    topic: z.string().min(1), title: cockpitStringSafe.pipe(z.string().min(3)), summary: cockpitStringSafe.pipe(z.string().min(3)),
    executionRoute: z.string().min(1), priorityTier: z.number().int().min(1).max(9), ownerApprovalRequired: z.boolean(),
  }),
  explanationSummary: cockpitStringSafe.pipe(z.string().min(3)),
  whyThisIsTopPriority: z.array(z.string()).min(1),
  supportingClusters: z.array(z.object({ topic: z.string().min(1), signalCount: z.number().int().positive() })).min(1),
  supportingSignalCount: z.number().int().positive(),
  strongestEvidence: z.string().min(1),
  weakestEvidence: z.string().min(1),
  verifiedFacts: z.array(z.string()),
  unverifiedSignals: z.array(z.string()).min(1),
  missingData: z.array(z.string()),
  riskIfIgnored: cockpitStringSafe.pipe(z.string().min(3)),
  whyNotGrowthYet: z.string().nullable(),
  ownerApprovalReason: z.string().nullable(),
  requiredEvidenceBeforeCompletion: z.array(z.string()),
  reassessmentAfterCompletion: z.string().min(3),
  blockedUnsafeActions: z.array(z.string()),
  secondaryActionGroups: z.array(secondarySchema),
  monitorOnlySummary: z.array(z.object({ topic: z.string().min(1), signalCount: z.number().int().positive(), whyNoAction: z.string().min(3) })),
  confidenceCaveat: z.string().min(3),
  ownerNextAction: cockpitStringSafe.pipe(z.string().min(3)),
  managerStaffNextAction: z.string().nullable(),
  safeCopy: cockpitStringSafe.pipe(z.string().min(3)),
  auditTrace: z.array(z.string()).min(1),
})
  // Fail-closed coherence invariants.
  .refine((e) => e.whyThisIsTopPriority.length > 0, { message: "a top action must carry a priority reason" })
  .refine((e) => !e.topAction.ownerApprovalRequired || (e.ownerApprovalReason !== null && e.ownerApprovalReason.length > 0), {
    message: "owner-approval-required top action must state why owner approval is required",
  })
  .refine((e) => !EVIDENCE_REQUIRED_ROUTES.has(e.topAction.executionRoute as ExecutionRoute) || e.requiredEvidenceBeforeCompletion.length > 0, {
    message: "a completion-evidence route must state the required evidence before completion",
  })
  .refine((e) => !HIGH_RISK_ROUTES.has(e.topAction.executionRoute as ExecutionRoute) || e.blockedUnsafeActions.length > 0, {
    message: "a high-risk route must list the blocked unsafe actions",
  });

const EVIDENCE_REQUIRED_ROUTES: ReadonlySet<ExecutionRoute> = new Set([
  "CREATE_CORRECTION_TASK", "CREATE_SOP_CHECKLIST_TASK", "CREATE_TRAINING_TASK", "CREATE_EVIDENCE_REQUEST",
  "CREATE_OWNER_APPROVAL_TASK", "CREATE_MANAGER_TASK", "CREATE_STAFF_TASK", "CREATE_REASSESSMENT_TASK",
]);
const HIGH_RISK_ROUTES: ReadonlySet<ExecutionRoute> = new Set(["CREATE_OWNER_APPROVAL_TASK"]);
const REASSESSMENT_ROUTES: ReadonlySet<ExecutionRoute> = new Set([
  "CREATE_CORRECTION_TASK", "CREATE_SOP_CHECKLIST_TASK", "CREATE_TRAINING_TASK", "CREATE_REASSESSMENT_TASK",
]);

const ROUTE_TITLE: Record<string, string> = {
  CREATE_CORRECTION_TASK: "Fix the failing step (with proof)",
  CREATE_EVIDENCE_REQUEST: "Verify with fresh evidence before accepting it as fixed",
  CREATE_REASSESSMENT_TASK: "Resolve and reassess the operational issue",
  CREATE_TRAINING_TASK: "Assign training / SOP correction (with adoption proof)",
  CREATE_SOP_CHECKLIST_TASK: "Update the SOP/checklist (owner-approved before adoption)",
  CREATE_MISSING_DATA_TASK: "Collect the missing internal data first",
  CREATE_OWNER_APPROVAL_TASK: "Owner decision required before anything proceeds",
  MONITOR_ONLY: "Monitor only — no action yet",
};

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Build the owner-facing explanation for a workspace's prioritised decision. Returns null when there is no
 * actionable decision (clean workspace or only monitor-only) — the cockpit then shows nothing to act on.
 */
export function explainOwnerCockpitDecision(p: PublicSignalPrioritisation | null): OwnerCockpitExplanation | null {
  if (!p || !p.topCollectiveAction) return null;
  const top = p.topCollectiveAction;
  const clusters = p.issueClusters;
  const topClusters = clusters.filter((c) => c.topic === top.topic && !c.monitorOnly);
  const supportCount = topClusters.reduce((n, c) => n + c.signalCount, 0) || 1;
  const trace: string[] = [...p.auditTrace, `explain:top=${top.topic}:tier=${top.priorityTier}`];

  const srcSummary = topClusters.map((c) => c.sourceQualitySummary).join("+");
  const evSummary = topClusters.map((c) => c.evidenceStrengthSummary).join("+");
  const hasOfficial = /VERIFIED_SOURCE/.test(srcSummary);
  const strongestEvidence = /STRONG/.test(evSummary) ? "STRONG (official/published)" : /MODERATE/.test(evSummary) ? "MODERATE (repeated public signals)" : /WEAK/.test(evSummary) ? "WEAK (few unverified public signals)" : "INSUFFICIENT";
  const weakestEvidence = /INSUFFICIENT/.test(evSummary) ? "INSUFFICIENT (ambiguous/low-context)" : /WEAK/.test(evSummary) ? "WEAK (unverified public signal)" : /MODERATE/.test(evSummary) ? "MODERATE" : "STRONG";

  const verifiedFacts = hasOfficial
    ? ["An official/published source confirms the published requirement (not internal execution)."]
    : [];
  const unverifiedSignals = [`${supportCount} public signal(s) [${srcSummary || "THIRD_PARTY_UNVERIFIED"}] — treated as unverified signals, not proof of internal execution.`];

  const route = top.executionRoute;
  const isGrowthAround = p.secondaryGroupedActions.some((s) => s.topic === "growth" || s.topic === "opportunity" || s.topic === "b2b")
    || p.monitorOnlyItems.some((m) => m.topic === "growth")
    || p.blockedUnsafeActions.some((b) => /scale before validation/i.test(b));
  const whyNotGrowthYet = isGrowthAround
    ? "Growth/marketing/expansion is subordinated: it never outranks an unresolved quality/cash/capacity/legal risk, and scale stays blocked until the risk is validated with proof."
    : null;

  const ownerApprovalReason = top.ownerApprovalRequired
    ? (p.ownerApprovalRequirements.find((r) => r.startsWith(top.topic)) ?? `The ${top.topic} decision is material (pricing/brand/spend/commitment/legal) — the owner decides; nothing is auto-applied.`)
    : null;

  const requiredEvidenceBeforeCompletion = EVIDENCE_REQUIRED_ROUTES.has(route)
    ? (p.evidenceRequirements.length ? p.evidenceRequirements : ["evidence the action was carried out"])
    : route === "CREATE_MISSING_DATA_TASK"
      ? (p.missingData.length ? p.missingData : ["the missing internal data to capture before the finding is re-evaluated"])
      : [];
  const reassessmentAfterCompletion = REASSESSMENT_ROUTES.has(route)
    ? "After completion, OpsIQ opens a governed reassessment to confirm the fix actually worked before the issue can be considered closed."
    : route === "CREATE_MISSING_DATA_TASK"
      ? "Once the missing data is captured, the finding is re-evaluated with real inputs (no conclusion is drawn until then)."
      : "Monitored until enough verified evidence exists to act.";

  const riskIfIgnored = riskFor(top.topic, route);
  const whyTop = uniq([...top.priorityReasons,
    `Outranks ${p.secondaryGroupedActions.length} grouped secondary action(s) and ${p.monitorOnlyItems.length} monitor-only item(s) on a transparent priority tier (tier ${top.priorityTier}), not an opaque score.`]);

  const secondaryActionGroups: SecondaryActionGroupView[] = p.secondaryGroupedActions.map((s) => ({
    topic: s.topic, priorityTier: s.priorityTier, signalCount: s.signalCount, ownerApprovalRequired: s.ownerApprovalRequired,
    summary: governedSummary(s.topic, s.executionRoute, s.ownerApprovalRequired),
  }));
  const monitorOnlySummary: MonitorOnlyExplained[] = p.monitorOnlyItems.map((m) => ({
    topic: m.topic, signalCount: m.signalCount,
    whyNoAction: m.topic === "quality" ? "A positive/low-value public signal is recorded but never closes an issue without executed-correction + outcome evidence." : "Not enough verified evidence to act — monitored only.",
  }));

  const ownerNextAction = top.ownerApprovalRequired
    ? `Review the evidence and record an approve/decline decision for the ${top.topic} action — nothing proceeds without it.`
    : `Confirm the ${top.topic} action is assigned; it proceeds under manager/staff with the required proof, owner-gated items stay with you.`;
  const managerStaffNextAction = top.ownerApprovalRequired ? null
    : route === "CREATE_MISSING_DATA_TASK" ? "Capture the listed missing internal data, then the finding is re-evaluated."
      : "Carry out the correction and submit the required completion evidence.";

  const confidenceCaveat = "Public data is a signal, not verified fact; more signals raise the urgency of validation, not certainty; no financial result is implied and nothing has been executed yet.";
  const explanationSummary = `Top action for this workspace: ${ROUTE_TITLE[route] ?? route} on the ${top.topic} issue (tier ${top.priorityTier}). ${top.decision}`;
  const safeCopy = `${explanationSummary} It is supported by ${supportCount} unverified public signal(s); evidence ranges ${weakestEvidence}→${strongestEvidence}. ${whyNotGrowthYet ?? ""} ${ownerApprovalReason ? "Owner approval is required because " + ownerApprovalReason.replace(/^[a-z_]+:\s*/, "") + "." : ""} ${confidenceCaveat}`.replace(/\s+/g, " ").trim();

  const explanation: OwnerCockpitExplanation = {
    cockpitExplanationId: `cockpit:${p.workspaceArchetype}:${djb2(`${top.topic}|${route}|${top.priorityTier}|${p.clusterCount}`)}`,
    workspaceArchetype: p.workspaceArchetype,
    topAction: { topic: top.topic, title: ROUTE_TITLE[route] ?? route, summary: top.decision, executionRoute: route, priorityTier: top.priorityTier, ownerApprovalRequired: top.ownerApprovalRequired },
    explanationSummary,
    whyThisIsTopPriority: whyTop,
    supportingClusters: topClusters.map((c) => ({ topic: c.topic, signalCount: c.signalCount })).length ? topClusters.map((c) => ({ topic: c.topic, signalCount: c.signalCount })) : [{ topic: top.topic, signalCount: supportCount }],
    supportingSignalCount: supportCount,
    strongestEvidence, weakestEvidence, verifiedFacts, unverifiedSignals,
    missingData: p.missingData,
    riskIfIgnored, whyNotGrowthYet, ownerApprovalReason,
    requiredEvidenceBeforeCompletion, reassessmentAfterCompletion,
    blockedUnsafeActions: p.blockedUnsafeActions,
    secondaryActionGroups, monitorOnlySummary,
    confidenceCaveat, ownerNextAction, managerStaffNextAction, safeCopy,
    auditTrace: trace,
  };
  return explanation;
}

/** Explain AND validate — an incoherent/unsafe explanation can never reach the owner cockpit. */
export function explainAndValidateOwnerCockpit(
  p: PublicSignalPrioritisation | null,
): { ok: true; explanation: OwnerCockpitExplanation } | { ok: false; issues: string[] } | { ok: true; explanation: null } {
  const explanation = explainOwnerCockpitDecision(p);
  if (explanation === null) return { ok: true, explanation: null };
  const parsed = ownerCockpitExplanationSchema.safeParse(explanation);
  if (parsed.success) return { ok: true, explanation };
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return { ok: false, issues };
}

function riskFor(topic: SignalTopic, route: ExecutionRoute): string {
  if (route === "CREATE_OWNER_APPROVAL_TASK") return "Acting without the owner's decision risks an unauthorised pricing/brand/spend/legal commitment.";
  switch (topic) {
    case "quality": return "Left unresolved, the quality/rework problem keeps costing rework and damaging reputation.";
    case "operations": return "An unresolved operational bottleneck (e.g. maintenance) worsens customer harm and cost.";
    case "tender": return "Missing the eligibility/cost work risks an ineligible or loss-making bid — but nothing is auto-submitted.";
    case "b2b": return "Pursuing without capacity/cost proof risks over-committing beyond what the business can safely deliver.";
    default: return "Ignoring the validation step risks acting on unverified public signals.";
  }
}

function governedSummary(topic: SignalTopic, route: ExecutionRoute, owner: boolean): string {
  const base = ROUTE_TITLE[route] ?? route;
  return `${topic}: ${base}${owner ? " (owner-gated)" : ""}.`;
}
