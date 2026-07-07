/**
 * Public Signal Volume & Prioritisation (PASS 30).
 *
 * A CONSERVATIVE, DETERMINISTIC layer that takes MANY interpreted public signals for ONE workspace
 * (10–50+), groups them into issue clusters, resolves each cluster with the PASS 29 conflict layer, and
 * prioritises the cluster decisions into ONE top collective action + grouped secondary actions — without
 * cockpit spam, without manufacturing certainty from volume, and without letting growth/marketing/tender-
 * submit/launch/discount/outreach outrank an unresolved quality/cash/capacity/legal/reputation blocker.
 *
 * Core stance (matches OpsIQ rules):
 *   - Many weak signals never become verified fact; volume raises the URGENCY of validation/reassessment,
 *     never CERTAINTY.
 *   - Duplicate/same-topic signals collapse into one cluster → one governed task, never one-task-per-signal.
 *   - Positive signals cannot close unresolved negatives without executed-correction + outcome evidence.
 *   - Fake money/ROI/win-probability stays rejected; prompt injection stays blocked; PII stays stripped.
 *   - Priority is a transparent, ordered TIER with explicit reasons — NOT an opaque score.
 *   - Material action stays owner-gated; evidence stays required; the governed bridge remains the authority.
 *
 * Pure + deterministic: no Date.now / Math.random / IO.
 */

import { z } from "zod";
import type { ProcessCorrection } from "./bottleneck-correction-routing";
import type { ExecutionRoute } from "./process-execution-bridge";
import { PUBLIC_ARCHETYPES, type PublicArchetype, type NormalizedPublicSignal } from "./public-signal-interpretation";
import {
  resolvePublicSignalConflict, conflictDecisionToProcessCorrection,
  type ConflictSignalInput, type ConflictDecisionPackage,
} from "./public-signal-conflict-resolution";

/** Coarse topic groups so same-topic signals (incl. positive vs negative about the same thing) cluster together. */
export const SIGNAL_TOPICS = ["quality", "operations", "pricing", "tender", "b2b", "growth", "opportunity", "unclear"] as const;
export type SignalTopic = (typeof SIGNAL_TOPICS)[number];

/** Priority tiers — a transparent ordered band (1 = act first), each carrying explicit reasons (never opaque). */
export const PRIORITY_TIERS = {
  OWNER_LEGAL_CONTRACT_REPUTATION: 2,
  CUSTOMER_QUALITY_REWORK: 3,
  CASH_PROFIT_MISSING_DATA: 4,
  CAPACITY_STAFF_SOP: 5,
  TENDER_ELIGIBILITY_DEADLINE: 6,
  PRICING_OR_VALIDATION_GATED: 7,
  GROWTH_OPPORTUNITY: 8,
  MONITOR_ONLY_OR_POSITIVE: 9,
} as const;

export interface PrioritiseInput {
  workspaceArchetype: PublicArchetype;
  signals: ConflictSignalInput[];
}

export interface IssueClusterView {
  topic: SignalTopic;
  signalCount: number;
  conflictClassification: string;
  recommendedExecutionRoute: ExecutionRoute;
  ownerApprovalRequired: boolean;
  priorityTier: number;
  priorityReasons: string[];
  missingData: string[];
  evidenceRequired: string[];
  monitorOnly: boolean;
  collectiveDecision: string;
  /** Best→worst source quality present in the cluster (e.g. "VERIFIED_SOURCE+THIRD_PARTY_UNVERIFIED"). */
  sourceQualitySummary: string;
  /** Best→worst evidence strength present in the cluster (e.g. "MODERATE+WEAK"). */
  evidenceStrengthSummary: string;
}

export interface TopCollectiveAction {
  topic: SignalTopic;
  executionRoute: ExecutionRoute;
  ownerApprovalRequired: boolean;
  priorityTier: number;
  priorityReasons: string[];
  decision: string;
}

export interface SecondaryGroupedAction {
  topic: SignalTopic;
  executionRoute: ExecutionRoute;
  ownerApprovalRequired: boolean;
  priorityTier: number;
  signalCount: number;
  decision: string;
}

export interface MonitorOnlyItem {
  topic: SignalTopic;
  signalCount: number;
  reason: string;
}

export interface PublicSignalPrioritisation {
  workspaceArchetype: PublicArchetype;
  totalSignals: number;
  clusterCount: number;
  issueClusters: IssueClusterView[];
  topCollectiveAction: TopCollectiveAction | null;
  secondaryGroupedActions: SecondaryGroupedAction[];
  blockedUnsafeActions: string[];
  ownerApprovalRequirements: string[];
  evidenceRequirements: string[];
  missingData: string[];
  monitorOnlyItems: MonitorOnlyItem[];
  cockpitSummary: string;
  antiSpamSummary: string;
  auditTrace: string[];
}

export const publicSignalPrioritisationSchema = z.object({
  workspaceArchetype: z.enum(PUBLIC_ARCHETYPES),
  totalSignals: z.number().int().nonnegative(),
  clusterCount: z.number().int().nonnegative(),
  issueClusters: z.array(z.object({
    topic: z.enum(SIGNAL_TOPICS),
    signalCount: z.number().int().positive(),
    conflictClassification: z.string().min(1),
    recommendedExecutionRoute: z.string().min(1),
    ownerApprovalRequired: z.boolean(),
    priorityTier: z.number().int().min(1).max(9),
    priorityReasons: z.array(z.string()).min(1),
    missingData: z.array(z.string()),
    evidenceRequired: z.array(z.string()),
    monitorOnly: z.boolean(),
    collectiveDecision: z.string().min(3),
    sourceQualitySummary: z.string().min(1),
    evidenceStrengthSummary: z.string().min(1),
  })),
  topCollectiveAction: z.object({
    topic: z.enum(SIGNAL_TOPICS),
    executionRoute: z.string().min(1),
    ownerApprovalRequired: z.boolean(),
    priorityTier: z.number().int().min(1).max(9),
    priorityReasons: z.array(z.string()).min(1),
    decision: z.string().min(3),
  }).nullable(),
  secondaryGroupedActions: z.array(z.object({
    topic: z.enum(SIGNAL_TOPICS),
    executionRoute: z.string().min(1),
    ownerApprovalRequired: z.boolean(),
    priorityTier: z.number().int().min(1).max(9),
    signalCount: z.number().int().positive(),
    decision: z.string().min(3),
  })),
  blockedUnsafeActions: z.array(z.string()),
  ownerApprovalRequirements: z.array(z.string()),
  evidenceRequirements: z.array(z.string()),
  missingData: z.array(z.string()),
  monitorOnlyItems: z.array(z.object({ topic: z.enum(SIGNAL_TOPICS), signalCount: z.number().int().positive(), reason: z.string().min(1) })),
  cockpitSummary: z.string().min(3),
  antiSpamSummary: z.string().min(3),
  auditTrace: z.array(z.string()).min(1),
})
  // A top action exists iff there is at least one actionable (non-monitor) cluster.
  .refine((p) => (p.topCollectiveAction === null) === (p.issueClusters.filter((c) => !c.monitorOnly).length === 0), {
    message: "topCollectiveAction must be present iff an actionable cluster exists",
  })
  // Anti-spam: never more governed clusters than signals (clustering can only reduce).
  .refine((p) => p.clusterCount <= p.totalSignals, { message: "clusters can never exceed signals" })
  // No fabricated currency/percentage in any governed summary.
  .refine((p) => !/[$£€]\s?\d|\b\d+(\.\d+)?\s?%/.test(p.cockpitSummary + p.antiSpamSummary), {
    message: "no fabricated currency/percentage may appear in a governed summary",
  });

/** Deterministic topic of a single interpreted signal (positive claims fold into the quality topic). */
function topicOf(s: NormalizedPublicSignal): SignalTopic {
  switch (s.businessIssueType) {
    case "QUALITY_FAILURE_LOOP":
    case "PROCESS_QUALITY_BREAKDOWN":
    case "SINGLE_UNVERIFIED_COMPLAINT":
    case "PRODUCT_SUPPORT_ISSUE":
    case "POSITIVE_OR_RESOLVED_CLAIM":
      return "quality";
    case "OPERATIONAL_BOTTLENECK":
      return "operations";
    case "CASH_MARGIN_RISK":
      return "pricing";
    case "MULTI_MODULE_CONFLICT":
      return "quality"; // collective quality/cost signals resolve under the quality topic
    case "OPPORTUNITY_SIGNAL":
      return s.opportunityType === "TENDER_BID" ? "tender"
        : s.opportunityType === "B2B_PURSUIT" ? "b2b"
        : s.opportunityType === "SCALE_TEMPTATION" ? "growth" : "opportunity";
    case "UNCLEAR_INSUFFICIENT":
    default:
      return s.opportunityType === "SCALE_TEMPTATION" ? "growth" : "unclear";
  }
}

interface Cluster { topic: SignalTopic; items: ConflictSignalInput[]; pkg: ConflictDecisionPackage; tier: number; reasons: string[]; monitorOnly: boolean }

const mentions = (xs: string[], needles: string[]) => xs.some((x) => needles.some((n) => x.toLowerCase().includes(n)));

const LEGAL_SPEND_RE = /\b(legal|lawsuit|contract|deposit|evict|reputation|large spend|major investment|penalt|liabilit)\b/;

/** Assign a transparent priority tier + reasons to a resolved cluster. Lower tier = act first.
 *  clusterText is the concatenated (PII-stripped) sanitized summaries — used only for deterministic keyword
 *  routing so that growth/expansion/marketing/outreach can never be mistaken for a legal/spend risk. */
function tierFor(topic: SignalTopic, pkg: ConflictDecisionPackage, clusterText: string): { tier: number; reasons: string[] } {
  const route = pkg.recommendedExecutionRoute;
  const md = pkg.missingData;
  const cashData = mentions(md, ["cost", "margin", "cash", "profit"]);
  const capacityData = mentions(md, ["capacity", "staff", "training"]);
  if (route === "MONITOR_ONLY") return { tier: PRIORITY_TIERS.MONITOR_ONLY_OR_POSITIVE, reasons: ["monitor-only: no verified action warranted yet"] };
  // Tender readiness is a data-first gate (never auto-submit), independent of urgency.
  if (topic === "tender") return { tier: PRIORITY_TIERS.TENDER_ELIGIBILITY_DEADLINE, reasons: ["tender readiness: eligibility/cost/documents required before any bid; nothing auto-submitted"] };
  // Owner-material decision: gated. Growth/expansion never outranks unresolved risk; legal/spend is high; pricing/brand ranks below operating risk.
  if (pkg.ownerApprovalRequired) {
    // Growth is decided by the cluster's TOPIC, never by stray keywords in a mixed cluster's text — otherwise a
    // real quality cluster that merely mentions "marketing"/"grow" would be wrongly demoted to the growth tier.
    if (topic === "growth" || topic === "opportunity" || topic === "b2b") return { tier: PRIORITY_TIERS.GROWTH_OPPORTUNITY, reasons: ["owner-gated growth/expansion — never outranks unresolved quality/cash/capacity; validate first"] };
    if (LEGAL_SPEND_RE.test(clusterText)) return { tier: PRIORITY_TIERS.OWNER_LEGAL_CONTRACT_REPUTATION, reasons: ["owner-gated legal/contract/reputation/large-spend risk"] };
    return { tier: PRIORITY_TIERS.PRICING_OR_VALIDATION_GATED, reasons: ["owner-gated pricing/brand/commitment decision — never auto; ranks below unresolved operating risk"] };
  }
  // Non-owner clusters are prioritised by TOPIC (the kind of risk), not by whether the route happens to be a
  // correction vs a validation/data task — an unverified public quality complaint is still a quality blocker.
  if (cashData) return { tier: PRIORITY_TIERS.CASH_PROFIT_MISSING_DATA, reasons: ["cash/profit unknown — collect internal data before any money-affecting decision"] };
  if (route === "CREATE_TRAINING_TASK" || capacityData) return { tier: PRIORITY_TIERS.CAPACITY_STAFF_SOP, reasons: ["capacity/staff/SOP blocker — resolve before taking on more"] };
  if (topic === "quality" || topic === "operations") return { tier: PRIORITY_TIERS.CUSTOMER_QUALITY_REWORK, reasons: ["unresolved customer quality/operational risk — fix/verify/validate with proof before closing (volume raises validation urgency, not certainty)"] };
  if (topic === "growth" || topic === "opportunity") return { tier: PRIORITY_TIERS.GROWTH_OPPORTUNITY, reasons: ["growth/opportunity — never outranks unresolved quality/cash/capacity; validate first"] };
  if (topic === "b2b") return { tier: PRIORITY_TIERS.CAPACITY_STAFF_SOP, reasons: ["B2B pursuit fit/capacity/cost validation before any outreach; outreach owner-gated"] };
  return { tier: PRIORITY_TIERS.PRICING_OR_VALIDATION_GATED, reasons: ["validation/missing-data — public signals unverified; validate before acting"] };
}

function computeClusters(input: PrioritiseInput): Cluster[] {
  const byTopic = new Map<SignalTopic, ConflictSignalInput[]>();
  for (const it of input.signals ?? []) {
    const t = topicOf(it.signal);
    (byTopic.get(t) ?? byTopic.set(t, []).get(t)!).push(it);
  }
  const clusters: Cluster[] = [];
  for (const [topic, items] of byTopic) {
    const pkg = resolvePublicSignalConflict({ conflictCaseId: `cluster-${topic}`, workspaceArchetype: input.workspaceArchetype, signals: items });
    if (!pkg) continue;
    const clusterText = items.map((i) => i.signal.sanitizedTextSummary).join(" ").toLowerCase();
    const { tier, reasons } = tierFor(topic, pkg, clusterText);
    clusters.push({ topic, items, pkg, tier, reasons, monitorOnly: pkg.recommendedExecutionRoute === "MONITOR_ONLY" });
  }
  // Deterministic order: tier asc, then more signals first (volume → urgency for validation, not certainty),
  // then a stable topic order.
  const topicOrder = SIGNAL_TOPICS as readonly string[];
  clusters.sort((a, b) => a.tier - b.tier || b.items.length - a.items.length || topicOrder.indexOf(a.topic) - topicOrder.indexOf(b.topic));
  return clusters;
}

const uniq = (xs: string[]) => [...new Set(xs)];

/** Prioritise many signals into one governed cockpit view. Returns null when there is nothing to decide. */
export function prioritisePublicSignals(input: PrioritiseInput): PublicSignalPrioritisation | null {
  const items = input.signals ?? [];
  if (items.length === 0) return null;
  const clusters = computeClusters(input);
  if (clusters.length === 0) return null;

  const actionable = clusters.filter((c) => !c.monitorOnly);
  const monitor = clusters.filter((c) => c.monitorOnly);
  const trace: string[] = [`signals:${items.length}`, `clusters:${clusters.length}`, `actionable:${actionable.length}`, `monitor:${monitor.length}`];

  const view = (c: Cluster): IssueClusterView => ({
    topic: c.topic, signalCount: c.items.length, conflictClassification: c.pkg.conflictClassification,
    recommendedExecutionRoute: c.pkg.recommendedExecutionRoute, ownerApprovalRequired: c.pkg.ownerApprovalRequired,
    priorityTier: c.tier, priorityReasons: c.reasons, missingData: c.pkg.missingData, evidenceRequired: c.pkg.evidenceRequired,
    monitorOnly: c.monitorOnly, collectiveDecision: c.pkg.recommendedCollectiveDecision,
    sourceQualitySummary: c.pkg.sourceQualitySummary, evidenceStrengthSummary: c.pkg.evidenceStrengthSummary,
  });

  const top = actionable[0] ?? null;
  const topCollectiveAction: TopCollectiveAction | null = top
    ? { topic: top.topic, executionRoute: top.pkg.recommendedExecutionRoute, ownerApprovalRequired: top.pkg.ownerApprovalRequired, priorityTier: top.tier, priorityReasons: top.reasons, decision: top.pkg.recommendedCollectiveDecision }
    : null;
  const secondaryGroupedActions: SecondaryGroupedAction[] = actionable.slice(1).map((c) => ({
    topic: c.topic, executionRoute: c.pkg.recommendedExecutionRoute, ownerApprovalRequired: c.pkg.ownerApprovalRequired,
    priorityTier: c.tier, signalCount: c.items.length, decision: c.pkg.recommendedCollectiveDecision,
  }));
  const monitorOnlyItems: MonitorOnlyItem[] = monitor.map((c) => ({ topic: c.topic, signalCount: c.items.length, reason: c.pkg.monitorOnlyReason ?? "monitored until enough verified evidence exists" }));

  const blockedUnsafeActions = uniq(clusters.flatMap((c) => c.pkg.blockedUnsafeActions));
  const ownerApprovalRequirements = uniq(clusters.filter((c) => c.pkg.ownerApprovalRequired).map((c) => `${c.topic}: owner approval required`));
  const evidenceRequirements = uniq([top, ...actionable.slice(1)].filter(Boolean).flatMap((c) => c!.pkg.evidenceRequired));
  const missingData = uniq(clusters.flatMap((c) => c.pkg.missingData));

  const cockpitSummary = top
    ? `Top action (${top.topic}, tier ${top.tier}): ${top.pkg.recommendedCollectiveDecision} Plus ${secondaryGroupedActions.length} grouped secondary action(s) and ${monitorOnlyItems.length} monitor-only item(s).${blockedUnsafeActions.length ? ` Blocked/owner-aware: ${blockedUnsafeActions.length} item(s).` : ""}`
    : `No actionable item — ${monitorOnlyItems.length} monitor-only item(s); nothing acted on.`;
  const antiSpamSummary = `${items.length} raw signal(s) → ${clusters.length} issue cluster(s) → 1 top action + ${secondaryGroupedActions.length} grouped secondary + ${monitorOnlyItems.length} monitor-only. No raw-signal dump.`;

  return {
    workspaceArchetype: input.workspaceArchetype,
    totalSignals: items.length,
    clusterCount: clusters.length,
    issueClusters: clusters.map(view),
    topCollectiveAction,
    secondaryGroupedActions,
    blockedUnsafeActions,
    ownerApprovalRequirements,
    evidenceRequirements,
    missingData,
    monitorOnlyItems,
    cockpitSummary,
    antiSpamSummary,
    auditTrace: trace,
  };
}

/** Prioritise AND validate — invalid/inconsistent output can never enter the governed path. */
export function prioritiseAndValidate(
  input: PrioritiseInput,
): { ok: true; prioritisation: PublicSignalPrioritisation } | { ok: false; issues: string[] } | { ok: true; prioritisation: null } {
  const prioritisation = prioritisePublicSignals(input);
  if (prioritisation === null) return { ok: true, prioritisation: null };
  const parsed = publicSignalPrioritisationSchema.safeParse(prioritisation);
  if (parsed.success) return { ok: true, prioritisation };
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return { ok: false, issues };
}

/**
 * Map the prioritised clusters into governed ProcessCorrections — ONE per ACTIONABLE cluster (never one
 * per signal). Monitor-only clusters produce no task. priorityRank = tier so the bridge's top route is the
 * top collective action. The bridge remains the routing/owner-gating/evidence-gating authority.
 */
export function prioritisationToProcessCorrections(input: PrioritiseInput, workspaceId: string): ProcessCorrection[] {
  const clusters = computeClusters(input).filter((c) => !c.monitorOnly);
  return clusters.map((c) => conflictDecisionToProcessCorrection(c.pkg, workspaceId, `cl-${c.topic}`, c.tier));
}
