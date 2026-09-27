/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner decision candidates — normalizes persisted domain actions and business-scoped control
 * records into the Spine's `OwnerDecisionCandidate` contract (src/domain/owner-spine/owner-decision.ts).
 *
 * Pure (row in → candidate out). Domain economics are NEVER recalculated here: the stored Spine
 * `priorityScore`, effort, impact and confidence are carried through unchanged; the linked finding
 * supplies severity, evidence and missing-data; lifecycle state decides eligibility:
 *
 *   - completed / cancelled                      → excluded (terminal)
 *   - own latest verification reached its target → excluded ("verified_complete")
 *   - a fix for the same issue was verified AFTER the evidence this action was planned from
 *     (re-diagnosis re-proposes from the unchanged snapshot) → excluded until new evidence arrives
 *   - any status outside the open set            → excluded ("superseded")
 *
 * "Reached its target" reuses the single existing definition, `extractReachedTargetFromVerification`.
 */
import { extractReachedTargetFromVerification } from "@/domain/owner-finance/outcome-signals";
import { isExpired } from "@/domain/owner-mode/compliance-boundary";
import {
  classifyOwnerFindingCode,
  type OwnerCandidateExclusion,
  type OwnerDecisionCandidate,
  type OwnerPriorityClass,
} from "@/domain/owner-spine/owner-decision";
import { clampConfidence, clampScore, OWNER_SEVERITIES, type OwnerDomain, type OwnerSeverity } from "@/domain/owner-spine/contracts";

/** Statuses that still need the owner (the single open-status definition for the arbiter). */
export const OPEN_OWNER_ACTION_STATUSES: readonly string[] = ["proposed", "assigned", "in_progress", "blocked"];

/** Evidence older than this is flagged stale (same window as the Business Condition staleness rule). */
export const OWNER_DECISION_STALE_EVIDENCE_DAYS = 45;

export const OWNER_DOMAIN_ROUTE: Record<string, string> = {
  finance: "/owner/finance",
  cashflow: "/owner/cashflow",
  strategy: "/owner/strategy",
  recovery: "/owner/recovery",
  sales: "/owner/sales",
  operations: "/owner/operations",
  sop: "/owner/execution",
  marketing: "/owner/marketing",
  compliance: "/owner/compliance",
  risk: "/owner/risks",
};

export function toOwnerSeverity(value: unknown): OwnerSeverity | null {
  return typeof value === "string" && (OWNER_SEVERITIES as readonly string[]).includes(value) ? (value as OwnerSeverity) : null;
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

/** A verification row reduced to what eligibility needs (all domains share these columns). */
export interface VerificationFact {
  findingCode: string;
  reachedTarget: boolean;
  at: Date;
}

/** Normalize a verification row (Recovery names its direction column `direction`). */
export function verificationReachedTarget(v: any): boolean {
  // Only a directional target can be "reached"; anything else never excludes work as verified.
  const direction = String(v?.targetDirection ?? v?.direction ?? "");
  if (direction !== "up" && direction !== "down") return false;
  return extractReachedTargetFromVerification({
    status: String(v?.status ?? ""),
    afterValue: typeof v?.afterValue === "number" ? v.afterValue : null,
    targetValue: typeof v?.targetValue === "number" ? v.targetValue : null,
    targetDirection: direction,
  });
}

export function verificationTime(v: any): Date {
  return asDate(v?.verifiedAt) ?? asDate(v?.createdAt) ?? new Date(0);
}

export interface DomainCandidateContext {
  businessId: string;
  workspaceId: string;
  domain: OwnerDomain;
  /** Findings of the action's cycle, by id (severity / evidence / missing data). */
  findingsById: Map<string, any>;
  /** When the evidence behind this cycle was captured (snapshot createdAt); null if unknown. */
  evidenceAsOf: Date | null;
  stale: boolean;
  /** Latest target-reached verification per finding code in this domain (any cycle). */
  verifiedFixes: Map<string, Date>;
}

function exclusionFor(action: any, ctx: DomainCandidateContext, findingCode: string): OwnerCandidateExclusion | null {
  const status = String(action.status ?? "");
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (!OPEN_OWNER_ACTION_STATUSES.includes(status)) return "superseded";
  // The latest CONCLUSIVE own verification decides (an inconclusive/unverified/disputed row recorded
  // later does not reopen work that was verified as fixed; a later verified_not_improved does).
  const own = (Array.isArray(action.verifications) ? action.verifications : []).filter(
    (v: any) => v?.status === "verified_improved" || v?.status === "verified_not_improved"
  );
  const latestOwn = own.reduce((best: any, v: any) => (best === null || verificationTime(v) > verificationTime(best) ? v : best), null);
  if (latestOwn && verificationReachedTarget(latestOwn)) return "verified_complete";
  const fixedAt = ctx.verifiedFixes.get(findingCode);
  if (fixedAt && ctx.evidenceAsOf && fixedAt.getTime() >= ctx.evidenceAsOf.getTime()) return "verified_fix_awaiting_new_evidence";
  return null;
}

/** A persisted Spine-domain action row (finance/cashflow/sales/operations/sop/marketing/strategy). */
export function domainActionToCandidate(action: any, ctx: DomainCandidateContext): OwnerDecisionCandidate {
  const finding = action.findingId ? ctx.findingsById.get(action.findingId) ?? null : null;
  const findingCode = String(action.findingCode ?? finding?.code ?? "UNKNOWN");
  const evidence = [
    ...stringArray(finding?.evidence),
    ...(typeof action.evidenceRationale === "string" && action.evidenceRationale ? [action.evidenceRationale] : []),
  ];
  return {
    candidateId: `domain_action:${ctx.domain}:${action.id}`,
    businessId: ctx.businessId,
    workspaceId: ctx.workspaceId,
    source: "domain_action",
    domain: ctx.domain,
    sourceId: String(action.id),
    priorityClass: classifyOwnerFindingCode(findingCode),
    findingCode,
    findingId: action.findingId ?? null,
    title: String(action.title ?? ""),
    explanation: String(action.description ?? ""),
    severity: toOwnerSeverity(finding?.severity),
    priorityScore: clampScore(action.priorityScore),
    expectedImpactScore: clampScore(action.expectedImpactScore),
    confidence: clampConfidence(typeof action.confidence === "number" ? action.confidence : 0),
    effortScore: clampScore(action.effortScore),
    status: String(action.status ?? ""),
    ownerActionRequired: true,
    blocking: action.status === "blocked",
    evidence,
    missingData: stringArray(finding?.missingData),
    verificationMetric: typeof action.verificationMetric === "string" ? action.verificationMetric : null,
    evidenceAsOf: ctx.evidenceAsOf,
    stale: ctx.stale,
    exclusion: exclusionFor(action, ctx, findingCode),
    targetRoute: OWNER_DOMAIN_ROUTE[ctx.domain] ?? "/owner",
  };
}

// Recovery predates the Spine: its action `priority` IS the linked finding's severity
// (founder-recovery/recovery-actions.ts), and its effort/priority are words, mapped by the same
// documented tables the Business Condition adapter uses.
const RECOVERY_PRIORITY_SCORE: Record<string, number> = { critical: 90, high: 70, medium: 45, low: 20 };
const RECOVERY_EFFORT_SCORE: Record<string, number> = { high: 75, medium: 50, low: 25 };

export function recoveryActionToCandidate(action: any, ctx: DomainCandidateContext): OwnerDecisionCandidate {
  const findingCode = String(action.finding?.code ?? action.metricToMove ?? "RECOVERY_ACTION");
  const severity = toOwnerSeverity(action.finding?.severity) ?? toOwnerSeverity(action.priority);
  return {
    candidateId: `domain_action:recovery:${action.id}`,
    businessId: ctx.businessId,
    workspaceId: ctx.workspaceId,
    source: "domain_action",
    domain: "recovery",
    sourceId: String(action.id),
    priorityClass: classifyOwnerFindingCode(findingCode),
    findingCode,
    findingId: action.findingId ?? null,
    title: String(action.title ?? ""),
    explanation: String(action.description ?? ""),
    severity,
    priorityScore: RECOVERY_PRIORITY_SCORE[action.priority] ?? 40,
    expectedImpactScore: RECOVERY_PRIORITY_SCORE[action.priority] ?? 40,
    confidence: clampConfidence(typeof action.confidence === "number" ? action.confidence : 0),
    effortScore: RECOVERY_EFFORT_SCORE[action.effort] ?? 50,
    status: String(action.status ?? ""),
    ownerActionRequired: true,
    blocking: action.status === "blocked",
    evidence: typeof action.expectedOutcome === "string" && action.expectedOutcome ? [action.expectedOutcome] : [],
    missingData: [],
    verificationMetric: typeof action.metricToMove === "string" ? action.metricToMove : null,
    evidenceAsOf: ctx.evidenceAsOf,
    stale: ctx.stale,
    exclusion: exclusionFor(action, ctx, findingCode),
    targetRoute: OWNER_DOMAIN_ROUTE.recovery,
  };
}

const TERMINAL_COMPLIANCE_STATUSES = new Set(["compliant", "waived"]);

/** Evidence strength from the item's recorded provenance (never a constant). */
const COMPLIANCE_PROVENANCE_CONFIDENCE: Record<string, number> = {
  authoritative_document: 1,
  professional_input: 0.85,
  owner_input: 0.7,
};
const UNSTATED_PROVENANCE_CONFIDENCE = 0.6;

/**
 * A compliance obligation competes only on what the existing compliance semantics PROVE:
 *   - `breached` — a recorded breach; the compliance service itself raises a CRITICAL alert for it
 *     (compliance.service.ts updateComplianceStatus) → hard safety/legal block, severity critical;
 *   - `active` and expired — exactly the owner-action gate's professional-review hard stop
 *     (owner-action-gate.service.ts, COMPLIANCE_BLOCKED, via the same `isExpired` rule) → hard
 *     block; the model records no severity for it, so none is invented;
 *   - expired but already in evidence/review (`evidence_pending` / `review_pending`) — the gate does
 *     not block on it: routine renewal work, never top safety precedence.
 * No priority, impact or severity is fabricated: the model supplies none, so the within-class
 * factors are 0 and the recorded provenance decides evidence strength.
 */
export function complianceItemToCandidate(
  item: any,
  ctx: { businessId: string; workspaceId: string; now: Date }
): OwnerDecisionCandidate | null {
  const status = String(item.status ?? "");
  if (TERMINAL_COMPLIANCE_STATUSES.has(status)) return null;
  const expiresAt = asDate(item.expiresAt);
  const expired = isExpired(expiresAt, ctx.now);
  const breached = status === "breached";
  const gateHardStop = status === "active" && expired;
  if (!breached && !expired) return null;
  const hardBlock = breached || gateHardStop;
  const name = String(item.name ?? "compliance obligation");
  const provenance = typeof item.provenanceSource === "string" ? item.provenanceSource : null;
  return {
    candidateId: `compliance_item:${item.id}`,
    // The row's own business (a null businessId is only passed in when the workspace has exactly one
    // real business, making it that business's by definition) — so a mis-scoped row is caught by the
    // arbiter's business filter instead of being silently re-stamped.
    businessId: typeof item.businessId === "string" ? item.businessId : ctx.businessId,
    workspaceId: ctx.workspaceId,
    source: "compliance_item",
    domain: "compliance",
    sourceId: String(item.id),
    priorityClass: hardBlock ? "SAFETY_COMPLIANCE" : "BLOCKED_EXECUTION",
    findingCode: hardBlock ? "COMPLIANCE_BREACH" : "COMPLIANCE_RENEWAL_IN_PROGRESS",
    findingId: null,
    title: breached
      ? `Resolve the breach of "${name}"`
      : hardBlock
        ? `Renew "${name}" (or get professional review) — it has expired`
        : `Finish renewing "${name}" — it expired and is ${status === "review_pending" ? "awaiting review" : "awaiting evidence"}`,
    explanation: typeof item.penaltyDescription === "string" && item.penaltyDescription
      ? `Consequence if left unresolved: ${item.penaltyDescription}`
      : gateHardStop
        // The action gate stops material actions on an active-but-expired obligation (compliance-boundary).
        ? "A legal or contractual obligation has expired; OpsIQ holds material actions until it is renewed or reviewed."
        : breached
          ? "This obligation is recorded as breached — a legal or contractual requirement is not being met."
          : "The renewal is in progress; finish it so the obligation is met again.",
    severity: breached ? "critical" : null,
    priorityScore: 0,
    expectedImpactScore: 0,
    confidence: provenance && provenance in COMPLIANCE_PROVENANCE_CONFIDENCE ? COMPLIANCE_PROVENANCE_CONFIDENCE[provenance] : UNSTATED_PROVENANCE_CONFIDENCE,
    effortScore: 50,
    status,
    ownerActionRequired: true,
    blocking: hardBlock,
    evidence: [
      breached ? "Recorded as breached." : `Expired on ${expiresAt!.toISOString().slice(0, 10)}.`,
      ...(typeof item.legalBasis === "string" && item.legalBasis ? [`Legal basis: ${item.legalBasis}`] : []),
    ],
    missingData: [],
    verificationMetric: null,
    evidenceAsOf: asDate(item.updatedAt),
    stale: false,
    exclusion: null,
    targetRoute: OWNER_DOMAIN_ROUTE.compliance,
  };
}

/** Owner-entered risk categories → business class (critical-severity risks only reach the arbiter). */
const RISK_CATEGORY_CLASS: Record<string, OwnerPriorityClass> = {
  COMPLIANCE: "SAFETY_COMPLIANCE",
  FINANCIAL: "SURVIVAL_CASH",
  OPERATIONAL: "BLOCKED_EXECUTION",
  EXECUTION: "BLOCKED_EXECUTION",
  // A CRITICAL market/strategic risk is revenue or profit under threat — never a growth option to defer.
  MARKET: "PROFIT_LOSS",
  STRATEGIC: "PROFIT_LOSS",
};
export const OPEN_RISK_STATUSES = new Set(["IDENTIFIED", "ASSESSED", "MITIGATING"]);
/** Evidence strength of an owner-recorded (not measured) risk. */
export const OWNER_RECORDED_RISK_CONFIDENCE = 0.6;
/** Same critical threshold the risk service uses to raise a critical alert (business-risk.service.ts). */
export const CRITICAL_RISK_SEVERITY = 75;

/**
 * A critical, open, owner-recorded risk. `BusinessRiskEntry` has no businessId, so the caller must
 * only pass risks when the workspace holds exactly one real business (hasExactlyOneRealBusiness).
 */
export function businessRiskToCandidate(
  risk: any,
  ctx: { businessId: string; workspaceId: string }
): OwnerDecisionCandidate | null {
  if (risk.isFixtureRecord) return null;
  if (!OPEN_RISK_STATUSES.has(String(risk.status ?? ""))) return null;
  // A risk being mitigated competes at its recorded RESIDUAL level when one has been assessed.
  const residual = risk.status === "MITIGATING" && typeof risk.residualRisk === "number" ? clampScore(risk.residualRisk) : null;
  const severityScore = residual ?? clampScore(risk.severity);
  if (severityScore < CRITICAL_RISK_SEVERITY) return null;
  const category = String(risk.category ?? "").toUpperCase();
  const priorityClass = RISK_CATEGORY_CLASS[category] ?? "PROFIT_LOSS";
  return {
    candidateId: `business_risk:${risk.id}`,
    businessId: ctx.businessId,
    workspaceId: ctx.workspaceId,
    source: "business_risk",
    domain: "risk",
    sourceId: String(risk.id),
    priorityClass,
    findingCode: `RISK_${category || "UNCATEGORISED"}`,
    findingId: null,
    title: typeof risk.mitigationAction === "string" && risk.mitigationAction
      ? `${String(risk.title)}: ${risk.mitigationAction}`
      : `Deal with the critical risk "${String(risk.title)}"`,
    explanation: typeof risk.description === "string" ? risk.description : "",
    severity: "critical",
    priorityScore: severityScore,
    expectedImpactScore: clampScore(risk.impact),
    // Likelihood is the chance the risk happens, not evidence strength: an owner-recorded risk is an
    // owner assessment, not measured data, so its evidence strength is fixed at "moderate".
    confidence: OWNER_RECORDED_RISK_CONFIDENCE,
    effortScore: 50,
    status: String(risk.status),
    ownerActionRequired: true,
    blocking: false,
    evidence: [`Recorded risk: likelihood ${clampScore(risk.likelihood)}/100, impact ${clampScore(risk.impact)}/100.`],
    missingData: [],
    verificationMetric: null,
    evidenceAsOf: asDate(risk.updatedAt),
    stale: false,
    exclusion: null,
    targetRoute: `${OWNER_DOMAIN_ROUTE.risk}/${risk.id}`,
  };
}
