/**
 * Owner Home & Mobile Usability (Module 12) — deterministic Owner Home Summary.
 *
 * Turns the already-proven per-domain spine data (domain scores, findings, actions,
 * verifications) into the exact §19 owner-home payload: business health; cash / sales
 * / operations / execution danger; the top 3 risks; the top 3 opportunities; today's
 * required (open, ranked) actions; and the last verified improvement.
 *
 * Pure and honest: no DB, no I/O, no LLM. A domain with no diagnosis is reported as
 * `unknown` danger (not 0). Risks/opportunities are real findings; required actions
 * are real open actions ranked by the proven spine priority; the last verified
 * improvement is a real recorded verification — nothing is invented.
 */
import {
  EXECUTION_DOMAINS,
  clampConfidence,
  clampScore,
  rankOwnerActions,
  type DomainScore,
  type OwnerAction,
  type OwnerDomain,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type {
  DangerLevel,
  DomainDanger,
  OwnerHomeOpportunity,
  OwnerHomeRisk,
  OwnerHomeSummary,
  RequiredAction,
  VerifiedImprovement,
} from "./types";

/** Action statuses that still require owner attention (i.e. not closed). */
export const OPEN_ACTION_STATUSES: readonly string[] = ["proposed", "assigned", "in_progress", "blocked"];

/** Max number of "today's required actions" surfaced on the home screen. */
export const MAX_REQUIRED_ACTIONS = 5;

const SEVERITY_RANK: Record<OwnerSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** A verification candidate fed to the summary (already workspace-scoped upstream). */
export interface OwnerHomeVerificationInput {
  domain: OwnerDomain;
  actionTitle: string;
  metric: string;
  beforeValue: number | null;
  afterValue: number | null;
  status: string;
  verifiedAt: Date;
}

export interface OwnerHomeSummaryInput {
  domainScores: DomainScore[];
  findings: OwnerFinding[];
  actions: OwnerAction[];
  verifications: OwnerHomeVerificationInput[];
  /** Injectable clock for deterministic output; defaults to now. */
  now?: Date;
}

/** Band a domain risk score (or null) into a danger level. Null → "unknown". */
export function dangerLevel(riskScore: number | null): DangerLevel {
  if (riskScore === null) return "unknown";
  const r = clampScore(riskScore);
  if (r < 20) return "none";
  if (r < 40) return "low";
  if (r < 60) return "elevated";
  if (r < 80) return "high";
  return "critical";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function maxOf(values: number[]): number {
  return values.reduce((m, v) => (v > m ? v : m), values[0]);
}

/** Danger for a single domain (null risk when that domain has no diagnosis). */
function dangerForDomain(scores: Map<OwnerDomain, DomainScore>, domain: OwnerDomain): DomainDanger {
  const s = scores.get(domain);
  const riskScore = s ? clampScore(s.riskScore) : null;
  return { key: domain, riskScore, level: dangerLevel(riskScore) };
}

/** Execution danger = max risk across the execution domains present (operations, sop). */
function executionDanger(scores: Map<OwnerDomain, DomainScore>): DomainDanger {
  const present = EXECUTION_DOMAINS.map((d) => scores.get(d)).filter((s): s is DomainScore => Boolean(s));
  if (present.length === 0) return { key: "execution", riskScore: null, level: "unknown" };
  const riskScore = clampScore(maxOf(present.map((s) => clampScore(s.riskScore))));
  return { key: "execution", riskScore, level: dangerLevel(riskScore) };
}

/** Build the deterministic §19 owner-home summary. Pure; never invents values. */
export function buildOwnerHomeSummary(input: OwnerHomeSummaryInput): OwnerHomeSummary {
  const scoreByDomain = new Map<OwnerDomain, DomainScore>();
  for (const s of input.domainScores) scoreByDomain.set(s.domain, s);

  const businessHealthScore = clampScore(average(input.domainScores.map((s) => clampScore(s.healthScore))));

  // Top 3 risks: real risk findings, worst first (severity → impact → confidence → domain → code).
  const top3Risks: OwnerHomeRisk[] = input.findings
    .filter((f) => f.findingType === "risk")
    .slice()
    .sort((a, b) => {
      if (SEVERITY_RANK[b.severity] !== SEVERITY_RANK[a.severity]) return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      const ib = clampScore(b.impactScore);
      const ia = clampScore(a.impactScore);
      if (ib !== ia) return ib - ia;
      const cb = clampConfidence(b.confidence);
      const ca = clampConfidence(a.confidence);
      if (cb !== ca) return cb - ca;
      if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    })
    .slice(0, 3)
    .map((f) => ({
      domain: f.domain,
      code: f.code,
      title: f.title,
      summary: f.summary,
      severity: f.severity,
      impactScore: clampScore(f.impactScore),
      confidence: clampConfidence(f.confidence),
    }));

  // Top 3 opportunities: real opportunity findings, best first (impact → confidence → domain → code).
  const top3Opportunities: OwnerHomeOpportunity[] = input.findings
    .filter((f) => f.findingType === "opportunity")
    .slice()
    .sort((a, b) => {
      const ib = clampScore(b.impactScore);
      const ia = clampScore(a.impactScore);
      if (ib !== ia) return ib - ia;
      const cb = clampConfidence(b.confidence);
      const ca = clampConfidence(a.confidence);
      if (cb !== ca) return cb - ca;
      if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    })
    .slice(0, 3)
    .map((f) => ({
      domain: f.domain,
      code: f.code,
      title: f.title,
      summary: f.summary,
      impactScore: clampScore(f.impactScore),
      confidence: clampConfidence(f.confidence),
    }));

  // Today's required actions: open actions only, ranked by the proven spine priority.
  const openActions = input.actions.filter((a) => OPEN_ACTION_STATUSES.includes(a.status));
  const requiredActions: RequiredAction[] = rankOwnerActions(openActions)
    .slice(0, MAX_REQUIRED_ACTIONS)
    .map((a) => ({
      domain: a.domain,
      findingCode: a.findingCode,
      title: a.title,
      ownerRole: a.ownerRole,
      status: a.status,
      priorityScore: clampScore(a.priorityScore),
      expectedImpactScore: clampScore(a.expectedImpactScore),
      effortScore: clampScore(a.effortScore),
      verificationMetric: a.verificationMetric,
    }));

  // Last verified improvement: the most recent verification recorded as an improvement.
  const improvements = input.verifications
    .filter((v) => v.status === "verified_improved")
    .slice()
    .sort((a, b) => b.verifiedAt.getTime() - a.verifiedAt.getTime());
  const lastVerifiedImprovement: VerifiedImprovement | null =
    improvements.length > 0
      ? {
          domain: improvements[0].domain,
          actionTitle: improvements[0].actionTitle,
          metric: improvements[0].metric,
          beforeValue: improvements[0].beforeValue,
          afterValue: improvements[0].afterValue,
          verifiedAt: improvements[0].verifiedAt,
        }
      : null;

  return {
    businessHealthScore,
    cashDanger: dangerForDomain(scoreByDomain, "cashflow"),
    salesDanger: dangerForDomain(scoreByDomain, "sales"),
    operationsDanger: dangerForDomain(scoreByDomain, "operations"),
    executionDanger: executionDanger(scoreByDomain),
    top3Risks,
    top3Opportunities,
    requiredActions,
    lastVerifiedImprovement,
    generatedAt: input.now ?? new Date(),
  };
}
