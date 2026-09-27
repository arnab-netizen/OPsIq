/**
 * Owner Home & Mobile Usability (Module 12) — deterministic Owner Home Summary.
 *
 * Turns the already-proven per-domain spine data (domain scores, findings, actions,
 * verifications) into the exact §19 owner-home payload: business health; cash / sales
 * / operations / execution danger; the top 3 risks; the top 3 opportunities; today's
 * owner decision is NOT computed here (see below); and the last verified improvement.
 *
 * Pure and honest: no DB, no I/O, no LLM. A domain with no diagnosis is reported as
 * `unknown` danger (not 0). Risks/opportunities are real findings; the last verified
 * improvement is a real recorded verification — nothing is invented.
 *
 * The owner's ranked actions ("what to do today", the main target) are deliberately NOT part of
 * this summary: they are the single canonical owner decision (owner-spine/owner-decision.ts),
 * resolved once by the owner-home service and rendered by every owner surface.
 */
import {
  DATA_CONFIDENCE_CAUTION,
  DATA_CONFIDENCE_INSUFFICIENT,
  EXECUTION_DOMAINS,
  clampConfidence,
  clampScore,
  ownerSeverityRank,
  type DomainScore,
  type OwnerDomain,
  type OwnerFinding,
} from "@/domain/owner-spine/contracts";
import type {
  DangerLevel,
  DomainDanger,
  OwnerHomeOpportunity,
  OwnerHomeRisk,
  OwnerHomeSummary,
  VerifiedImprovement,
} from "./types";

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
  verifications: OwnerHomeVerificationInput[];
  /** Slice 1 — missing-critical-data carried from the diagnosis layer (never invented). */
  missingCriticalData?: string[];
  /** Domains whose latest evidence is out of date: their findings are shown as last flagged, never current. */
  staleDomains?: readonly string[];
  /**
   * The survival source the canonical arbitration governs cash danger with ("cashflow" or "finance"):
   * Cash flow and Finance are two evidence sources for the same survival question, so the cash-danger
   * card reads the SAME source the resolver trusts (default: cashflow).
   */
  survivalSource?: "cashflow" | "finance";
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

function withFreshness(d: DomainDanger, stale: ReadonlySet<string>): DomainDanger {
  return d.riskScore !== null && d.key !== "execution" && stale.has(d.key) ? { ...d, lastFlagged: true } : d;
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
  const stale = new Set<string>(input.staleDomains ?? []);

  // Top 3 risks: real risk findings, worst first, in the canonical spine order
  // (severity → impact → urgency → confidence → domain → code); an unknown stored
  // severity ranks below low (ownerSeverityRank) rather than corrupting the sort.
  const top3Risks: OwnerHomeRisk[] = input.findings
    .filter((f) => f.findingType === "risk")
    .slice()
    .sort((a, b) => {
      const sev = ownerSeverityRank(b.severity) - ownerSeverityRank(a.severity);
      if (sev !== 0) return sev;
      const ib = clampScore(b.impactScore);
      const ia = clampScore(a.impactScore);
      if (ib !== ia) return ib - ia;
      const ub = clampScore(b.urgencyScore);
      const ua = clampScore(a.urgencyScore);
      if (ub !== ua) return ub - ua;
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
      lastFlagged: stale.has(f.domain),
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
      lastFlagged: stale.has(f.domain),
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

  // Slice 1 — data-sufficiency disclosure (worst domain confidence, never averaged
  // away). A missing-critical-data entry forces 'insufficient' even at high confidence.
  const confidences = input.domainScores.map((s) => clampScore(s.dataConfidenceScore));
  const lowestDataConfidenceScore = confidences.length > 0 ? Math.min(...confidences) : 0;
  const lowConfidenceDomains = input.domainScores
    .filter((s) => clampScore(s.dataConfidenceScore) < DATA_CONFIDENCE_CAUTION)
    .map((s) => s.domain);
  const missingCriticalData = Array.from(new Set(input.missingCriticalData ?? []));
  const dataSufficiency: OwnerHomeSummary["dataSufficiency"] = {
    status:
      lowestDataConfidenceScore < DATA_CONFIDENCE_INSUFFICIENT || missingCriticalData.length > 0
        ? "insufficient"
        : lowestDataConfidenceScore < DATA_CONFIDENCE_CAUTION
          ? "caution"
          : "sufficient",
    lowestDataConfidenceScore,
    lowConfidenceDomains,
    missingCriticalData,
  };

  return {
    businessHealthScore,
    cashDanger: withFreshness(dangerForDomain(scoreByDomain, input.survivalSource ?? "cashflow"), stale),
    salesDanger: withFreshness(dangerForDomain(scoreByDomain, "sales"), stale),
    operationsDanger: withFreshness(dangerForDomain(scoreByDomain, "operations"), stale),
    executionDanger: executionDanger(scoreByDomain),
    top3Risks,
    top3Opportunities,
    lastVerifiedImprovement,
    dataSufficiency,
    generatedAt: input.now ?? new Date(),
  };
}
