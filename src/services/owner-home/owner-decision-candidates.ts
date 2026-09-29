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
 *   - own latest verification reached its target, recorded AT OR AFTER the evidence this action's
 *     cycle rests on → excluded ("verified_complete"); a verification carried forward from before
 *     that evidence never closes the action against the newer evidence
 *   - a fix for the same issue was verified AFTER the evidence this action was planned from
 *     (re-diagnosis re-proposes from the unchanged snapshot) → excluded until new evidence arrives
 *   - any status outside the open set            → excluded ("superseded")
 * These are ACTION lifecycle states. They never close a survival ISSUE: survivalIssueCandidates keeps
 * the issue open while the evidence still raises it (see verificationResolvesIssue).
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
import { clampConfidence, clampScore, OWNER_SEVERITIES, ownerSeverityRank, type OwnerDomain, type OwnerSeverity } from "@/domain/owner-spine/contracts";

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

/** A persisted date column (Date, ISO string or epoch ms) as a Date; null when absent or invalid. */
export function asDate(v: unknown): Date | null {
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
  // Causal: only a verification recorded at or after the evidence this cycle rests on can close the
  // action; an older one (the action carried forward onto newer evidence) proves nothing about it, and
  // with no known evidence time nothing can be shown to be causal (fail safe: the action stays open).
  if (latestOwn && verificationReachedTarget(latestOwn) && ctx.evidenceAsOf && verificationTime(latestOwn).getTime() >= ctx.evidenceAsOf.getTime()) {
    return "verified_complete";
  }
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

/**
 * A Recovery action's finding code: its linked finding's code (every Recovery diagnosis code is explicitly
 * classified), else its metric, else "RECOVERY_ACTION" — the documented legacy fallback (unknown code →
 * GROW, the most conservative intent). Shared by the owner decision and the action gate's caller, so both
 * classify the action the same way.
 */
export function recoveryActionFindingCode(action: { finding?: { code?: unknown } | null; metricToMove?: unknown }): string {
  return String(action.finding?.code ?? action.metricToMove ?? "RECOVERY_ACTION");
}

export function recoveryActionToCandidate(action: any, ctx: DomainCandidateContext): OwnerDecisionCandidate {
  const findingCode = recoveryActionFindingCode(action);
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

/**
 * An expired or breached obligation recorded with NO business while the workspace holds several real
 * businesses. A null business does not prove the obligation applies to every business, so it restricts no
 * business's actions (owner-action-gate-policy.ts expiredComplianceFor) — but it is never hidden and never
 * treated as resolved: each business's decision surfaces it as safety work, asking the owner to assign it
 * to the business it affects. Null when the item raises nothing (not expired/breached, or terminal).
 */
export function unattributedComplianceItemToCandidate(
  item: any,
  ctx: { businessId: string; workspaceId: string; now: Date }
): OwnerDecisionCandidate | null {
  const base = complianceItemToCandidate({ ...item, businessId: ctx.businessId }, ctx);
  if (!base) return null;
  const name = String(item.name ?? "compliance obligation");
  const condition = item.status === "breached" ? "breached" : base.blocking ? "expired" : "expired, with its renewal in progress,";
  return {
    ...base,
    // A hard stop (breach / expired) stays safety work; a renewal already in progress keeps its class.
    findingCode: base.blocking ? "COMPLIANCE_UNATTRIBUTED" : base.findingCode,
    title: `Assign "${name}" to the business it affects`,
    explanation:
      `This ${condition} compliance item has not been assigned to an affected business, so OpsIQ cannot safely determine which business actions it restricts. It is not resolved: assign it to the business it applies to, then ${base.blocking ? "renew or resolve it" : "finish the renewal"}.`,
    // Not a recorded block on THIS business (its applicability is unknown): no "recorded block" precedence.
    blocking: false,
    evidence: [...base.evidence, "Recorded with no business, and this workspace has more than one business."],
    // Straight to the assignment control (compliance detail page, "Affected business").
    targetRoute: `/owner/compliance/${String(item.id)}#assign-business`,
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

/**
 * One cash/finance diagnosis as survival EVIDENCE: the issues its own rules raised, independent of
 * what happened to the actions proposed for them. `stale` = the evidence period is out of date or the
 * diagnosed snapshot was amended; `superseded` = a NEWER, disagreeing reading of the other source
 * governs (resolveCashFinanceSignal).
 */
export interface SurvivalEvidenceReading {
  domain: "cashflow" | "finance";
  periodEnd: Date | null;
  /** When the evidence was captured (the diagnosed snapshot's createdAt); null if unknown. */
  evidenceAt: Date | null;
  stale: boolean;
  superseded: boolean;
  /** The diagnosis's own data-confidence score (0-100), used when a finding carries none. */
  dataConfidenceScore: number;
  /** The cycle's persisted findings (code, title, summary, severity, confidence, sourceMetric, evidence, missingData). */
  findings: ReadonlyArray<any>;
  /** Every recorded verification in this domain (any cycle), as issue-resolution facts. */
  verifications: readonly IssueVerificationFact[];
}

/**
 * A recorded verification, reduced to what issue resolution needs. `afterValueSource` is where the
 * "after" value came from: every domain's verification service records the value the OWNER entered
 * (`afterValue: input.afterValue` in each owner domain verification.service.ts and founder-recovery), so it is
 * OWNER_REPORTED — never a measurement of new figures.
 */
export interface IssueVerificationFact {
  findingCode: string;
  metric: string | null;
  reachedTarget: boolean;
  at: Date;
  afterValueSource: "MEASURED" | "OWNER_REPORTED";
}

export function issueVerificationFact(v: any, findingCode: string): IssueVerificationFact {
  return {
    findingCode,
    metric: typeof v?.verificationMetric === "string" ? v.verificationMetric : null,
    reachedTarget: verificationReachedTarget(v),
    at: verificationTime(v),
    afterValueSource: "OWNER_REPORTED",
  };
}

/**
 * Whether a verification CLOSES an issue (not just its action). Only when it directly MEASURED the same
 * canonical metric the issue was raised on (the finding's sourceMetric), reached the target, and was
 * recorded AFTER the evidence that raised the issue. An owner-reported after value is a claim about
 * the response, not new figures: it never resolves the issue — only newer trusted evidence that no
 * longer raises it does.
 */
export function verificationResolvesIssue(
  v: IssueVerificationFact,
  issue: { findingCode: string; sourceMetric: string | null; evidenceAt: Date | null }
): boolean {
  return (
    v.reachedTarget &&
    v.afterValueSource === "MEASURED" &&
    v.findingCode === issue.findingCode &&
    v.metric !== null &&
    v.metric === issue.sourceMetric &&
    issue.evidenceAt !== null &&
    v.at.getTime() > issue.evidenceAt.getTime()
  );
}

/**
 * Closed ACTION lifecycle states. Each says how the owner responded — none says the issue is gone
 * (a verification can close an action; only newer evidence, or a direct measurement per
 * verificationResolvesIssue, closes the issue).
 */
const CLOSED_ACTION_EXCLUSIONS = new Set<OwnerCandidateExclusion>(["completed", "cancelled", "superseded", "verified_complete", "verified_fix_awaiting_new_evidence"]);
const RESPONSE_ORDER: readonly OwnerCandidateExclusion[] = ["verified_complete", "completed", "cancelled", "superseded", "verified_fix_awaiting_new_evidence"];

/**
 * Survival ISSUES, separated from their action lifecycle.
 *
 * A survival-class finding raised by a cash/finance diagnosis is an open business issue for as long as
 * the evidence that raised it is the evidence OpsIQ holds. An action is only how the owner responds:
 *   - an ELIGIBLE action for the SAME issue (same domain + finding code) already represents it →
 *     no second candidate (never a duplicate issue + action);
 *   - a completed, cancelled, superseded or VERIFIED action for it (or none at all) does NOT make the
 *     issue go away → the issue stays an explicit candidate, carrying that action's title and status;
 *     the action closes, the issue stays, and only refreshed figures can clear it;
 *   - a verification clears the issue only when it directly measured the issue's own metric after the
 *     evidence that raised it (verificationResolvesIssue) — never a carried-forward or owner-reported one;
 *   - a reading superseded by a newer disagreeing reading of the other source → not raised;
 *   - stale evidence → raised with `stale: true`, so the arbiter turns it into an explicit
 *     refresh-evidence target (never silently dropped, never current).
 * Coverage is per stable issue identity: an open action for a DIFFERENT survival finding (e.g. medium
 * FIN_HIGH_PAYABLES) never hides this one (e.g. critical FIN_INSOLVENT_RUNWAY).
 */
export function survivalIssueCandidates(
  readings: readonly SurvivalEvidenceReading[],
  candidates: readonly OwnerDecisionCandidate[],
  ctx: { businessId: string; workspaceId: string }
): OwnerDecisionCandidate[] {
  const out: OwnerDecisionCandidate[] = [];
  for (const r of readings) {
    if (r.superseded) continue;
    const label = r.domain === "cashflow" ? "Cash flow" : "Finance";
    const period = r.periodEnd ? r.periodEnd.toISOString().slice(0, 10) : null;
    // One issue per finding code (the most severe row if a cycle repeats a code).
    const byCode = new Map<string, any>();
    for (const f of r.findings) {
      const code = typeof f?.code === "string" ? f.code : "";
      if (!code || classifyOwnerFindingCode(code) !== "SURVIVAL_CASH") continue;
      const prev = byCode.get(code);
      if (!prev || ownerSeverityRank(toOwnerSeverity(f.severity) ?? "") > ownerSeverityRank(toOwnerSeverity(prev.severity) ?? "")) byCode.set(code, f);
    }
    for (const [code, f] of [...byCode.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const sameIssue = candidates.filter((c) => c.source === "domain_action" && c.domain === r.domain && c.findingCode === code);
      if (sameIssue.some((c) => c.exclusion === null)) continue;
      const issue = { findingCode: code, sourceMetric: typeof f.sourceMetric === "string" ? f.sourceMetric : null, evidenceAt: r.evidenceAt };
      if (r.verifications.some((v) => verificationResolvesIssue(v, issue))) continue;
      const closed = sameIssue.filter((c) => c.exclusion !== null && CLOSED_ACTION_EXCLUSIONS.has(c.exclusion));
      // The response the owner most recently acted on decides the wording: a verification before a
      // completion before a cancellation before a re-proposal waiting on new evidence (ties by id).
      const response = [...closed].sort((a, b) =>
        RESPONSE_ORDER.indexOf(a.exclusion!) - RESPONSE_ORDER.indexOf(b.exclusion!) || (a.candidateId < b.candidateId ? -1 : 1)
      )[0] ?? null;
      const findingTitle = typeof f.title === "string" && f.title ? f.title : code;
      const summary = typeof f.summary === "string" && f.summary ? ` ${f.summary}` : "";
      const responded = response
        ? response.exclusion === "verified_complete"
          ? `"${response.title}" was verified as reaching its target, but `
          : response.exclusion === "verified_fix_awaiting_new_evidence"
            ? `A fix for this was verified as reaching its target, but `
            : response.status === "completed"
            ? `"${response.title}" was marked done, but `
            : response.status === "cancelled"
              ? `"${response.title}" was cancelled, but `
              : `"${response.title}" is no longer open, but `
        : "";
      const findingConfidence = typeof f.confidence === "number" ? f.confidence : r.dataConfidenceScore / 100;
      out.push({
        candidateId: `survival_reading:${r.domain}:${code}`,
        businessId: ctx.businessId,
        workspaceId: ctx.workspaceId,
        source: "survival_reading",
        domain: r.domain,
        sourceId: String(f.id ?? code),
        priorityClass: "SURVIVAL_CASH",
        findingCode: code,
        findingId: typeof f.id === "string" ? f.id : null,
        title: response ? response.title : `Deal with: ${findingTitle}`,
        explanation: `${responded}${responded ? "your" : "Your"} ${label} figures${period ? ` for the period ending ${period}` : ""} still show "${findingTitle}".${summary} Only new figures can show it has gone — add refreshed ${label} figures.`,
        severity: toOwnerSeverity(f.severity),
        // The domain's own ratings for this issue, from its (closed) action when there is one; never invented.
        priorityScore: response ? clampScore(response.priorityScore) : 0,
        expectedImpactScore: response ? clampScore(response.expectedImpactScore) : 0,
        confidence: clampConfidence(findingConfidence),
        effortScore: response ? clampScore(response.effortScore) : 50,
        status: response ? response.status : "no_action",
        ownerActionRequired: true,
        blocking: false,
        evidence: [...stringArray(f.evidence), ...(response ? [] : [`${label} diagnosis raised "${findingTitle}".`])],
        missingData: stringArray(f.missingData),
        verificationMetric: typeof f.verificationMetric === "string" ? f.verificationMetric : response?.verificationMetric ?? null,
        evidenceAsOf: r.periodEnd,
        stale: r.stale,
        exclusion: null,
        targetRoute: OWNER_DOMAIN_ROUTE[r.domain] ?? "/owner",
        issueTitle: `Deal with: ${findingTitle}`,
      });
    }
  }
  return out;
}
