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
  type OwnerSeverity,
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
  /** When each diagnosed domain's evidence was captured (its diagnosed snapshot's createdAt). */
  evidenceAsOf?: Partial<Record<OwnerDomain, Date | null>>;
  /**
   * Cash flow's reading was superseded by a NEWER, disagreeing Finance reading (the same arbitration the
   * owner decision applies): the cash card then never shows the superseded score as current.
   */
  cashflowSuperseded?: boolean;
  /** Finance's reading was superseded by a NEWER, disagreeing Cash flow reading (same arbitration). */
  financeSuperseded?: boolean;
  /**
   * Finance's own CASH-survival findings (the most severe) from an un-superseded Finance diagnosis, used
   * for the cash card only when Cash flow has no current reading. Severity only — no score is borrowed
   * from Finance. `current` is false when those Finance figures are out of date (then last-known).
   */
  financeCashSignal?: { severity: OwnerSeverity; title: string; current: boolean } | null;
  /**
   * Cash flow and Finance currently disagree (one safe, one not) and neither can be shown to be more
   * current (the ONE current cash/finance reading's `conflicting`): the cash card states the conflict.
   */
  cashFinanceConflict?: { cashState: string; financeState: string } | null;
  /**
   * The in-progress current period's cash/finance reading, when it is WORSE than the completed reading (the
   * shared reading's `provisional`): it tightens the cash card and is labelled as in progress. It never
   * clears or softens the card.
   */
  provisionalCash?: { state: string; source: "cashflow" | "finance" } | null;
  /**
   * The in-progress period's Finance reading when it is worse than the completed one AND driven by profit and
   * margin (the shared reading's gateDriver "finance_profit"): it tightens the FINANCIAL card, labelled as in
   * progress — a profit/margin danger is never shown as cash danger.
   */
  provisionalFinancial?: { state: string } | null;
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

const DANGER_DATA_LABEL: Partial<Record<OwnerDomain, string>> = {
  cashflow: "Cash flow",
  finance: "Finance",
  sales: "Sales",
  operations: "Operations",
  sop: "Execution",
};

const UNKNOWN_DANGER = (key: DomainDanger["key"]): DomainDanger => ({
  key, sourceDomains: [], drivenBy: null, evidenceAsOf: null, status: "unknown", riskScore: null, level: "unknown", lastFlagged: false, updateDataLabel: null,
});

/** Severity-only level (a finding's severity, when no score applies). */
const SEVERITY_LEVEL: Record<OwnerSeverity, DangerLevel> = { critical: "critical", high: "high", medium: "elevated", low: "low" };

interface DangerContext {
  scores: Map<OwnerDomain, DomainScore>;
  stale: ReadonlySet<string>;
  evidenceAsOf: Partial<Record<OwnerDomain, Date | null>>;
}

/** Danger for one scored domain: current ⇒ score; out of date ⇒ last-known level, no score. */
function dangerForDomain(ctx: DangerContext, key: DomainDanger["key"], domain: OwnerDomain, drivenBy: string | null, forceLastKnown = false): DomainDanger {
  const s = ctx.scores.get(domain);
  if (!s) return UNKNOWN_DANGER(key);
  const score = clampScore(s.riskScore);
  const lastKnown = forceLastKnown || ctx.stale.has(domain);
  return {
    key,
    sourceDomains: [domain],
    drivenBy,
    evidenceAsOf: ctx.evidenceAsOf[domain] ?? null,
    status: lastKnown ? "last_known" : "current",
    riskScore: lastKnown ? null : score,
    level: dangerLevel(score),
    lastFlagged: lastKnown,
    updateDataLabel: lastKnown ? DANGER_DATA_LABEL[domain] ?? null : null,
  };
}

/**
 * Execution danger = the worst of the execution domains present (operations, sop). Its status, source and
 * evidence date follow the domain(s) that DRIVE the level: a current reading at least as bad as every
 * out-of-date one is shown as current (with its score); an out-of-date reading that is worse than every
 * current one is shown only as last known ("update … data").
 */
function executionDanger(ctx: DangerContext): DomainDanger {
  const present = EXECUTION_DOMAINS.filter((d) => ctx.scores.has(d));
  if (present.length === 0) return UNKNOWN_DANGER("execution");
  const scoreOf = (d: OwnerDomain) => clampScore(ctx.scores.get(d)!.riskScore);
  const current = present.filter((d) => !ctx.stale.has(d));
  const stale = present.filter((d) => ctx.stale.has(d));
  const currentMax = current.length > 0 ? maxOf(current.map(scoreOf)) : -1;
  const staleMax = stale.length > 0 ? maxOf(stale.map(scoreOf)) : -1;
  const lastKnown = staleMax > currentMax;
  const drivers = lastKnown ? stale.filter((d) => scoreOf(d) === staleMax) : current.filter((d) => scoreOf(d) === currentMax);
  const score = lastKnown ? staleMax : currentMax;
  const dates = drivers.map((d) => ctx.evidenceAsOf[d] ?? null).filter((d): d is Date => d !== null);
  return {
    key: "execution",
    sourceDomains: drivers,
    drivenBy: null,
    evidenceAsOf: dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
    status: lastKnown ? "last_known" : "current",
    riskScore: lastKnown ? null : score,
    level: dangerLevel(score),
    lastFlagged: lastKnown,
    updateDataLabel: lastKnown ? drivers.map((d) => DANGER_DATA_LABEL[d] ?? d).join(" and ") : null,
  };
}

/**
 * Cash danger is the CASH POSITION only: Cash flow's current reading; when Cash flow has no current
 * reading, Finance's own cash-survival findings (severity only, no score); otherwise Cash flow's
 * last-known reading. Finance's overall (margin/profit-driven) risk is never presented as cash danger.
 */
const LEVEL_RANK: Record<DangerLevel, number> = { unknown: -1, none: 0, low: 1, elevated: 2, high: 3, critical: 4 };
const SURVIVAL_STATE_LEVEL: Record<string, DangerLevel> = { SAFE: "none", WATCH: "low", AT_RISK: "elevated", CRITICAL: "high", INSOLVENT_RISK: "critical" };
const SURVIVAL_STATE_WORDS: Record<string, string> = { SAFE: "safe", WATCH: "on watch", AT_RISK: "at risk", CRITICAL: "critical", INSOLVENT_RISK: "at risk of insolvency" };

function cashDanger(ctx: DangerContext, input: OwnerHomeSummaryInput): DomainDanger {
  return tightenInProgress(completedCashDanger(ctx, input), input.provisionalCash ?? null, "cash survival");
}

/**
 * A card tightened by the in-progress period's reading when that is worse (labelled as in progress, never
 * completed truth); otherwise the completed card as is.
 */
function tightenInProgress(base: DomainDanger, prov: { state: string; source: "cashflow" | "finance" } | null, subject: string): DomainDanger {
  const provLevel = prov ? SURVIVAL_STATE_LEVEL[prov.state] : undefined;
  if (!prov || !provLevel || LEVEL_RANK[provLevel] <= LEVEL_RANK[base.level]) return base;
  const note = `This period's in-progress ${prov.source === "finance" ? "Finance" : "cash"} figures show ${subject} ${SURVIVAL_STATE_WORDS[prov.state] ?? prov.state.toLowerCase()} (in progress — not a completed period yet).`;
  return {
    ...base,
    sourceDomains: base.sourceDomains.includes(prov.source) ? base.sourceDomains : [...base.sourceDomains, prov.source],
    drivenBy: base.drivenBy ? `${note} ${base.drivenBy}` : note,
    status: "in_progress",
    level: provLevel,
    // The completed period's date is not the in-progress reading's: no date is shown for it.
    evidenceAsOf: null,
    riskScore: null,
    lastFlagged: false,
    updateDataLabel: null,
  };
}

function completedCashDanger(ctx: DangerContext, input: OwnerHomeSummaryInput): DomainDanger {
  const conflict = input.cashFinanceConflict ?? null;
  if (conflict) {
    // Two current readings disagree and neither supersedes the other: say so — no side is picked, and no
    // combined level or score is fabricated.
    return {
      key: "cashflow",
      sourceDomains: ["cashflow", "finance"],
      drivenBy: `Cash and Finance signals currently disagree (Cash flow: ${conflict.cashState}, Finance: ${conflict.financeState}). Confirm the latest figures before relying on the survival assessment.`,
      evidenceAsOf: ctx.evidenceAsOf.cashflow ?? null,
      status: "conflicting",
      riskScore: null,
      level: "unknown",
      lastFlagged: false,
      updateDataLabel: null,
    };
  }
  const hasCash = ctx.scores.has("cashflow");
  const cashCurrent = hasCash && !ctx.stale.has("cashflow") && !input.cashflowSuperseded;
  if (cashCurrent) return dangerForDomain(ctx, "cashflow", "cashflow", null);
  const fin = input.financeCashSignal ?? null;
  const finCurrent = fin !== null && fin.current && ctx.scores.has("finance") && !ctx.stale.has("finance");
  if (fin && (finCurrent || !hasCash)) {
    // Finance's own cash-survival finding: current, or (with no Cash flow reading at all) last known —
    // never "no data" beside a Finance cash-survival reading.
    return {
      key: "cashflow",
      sourceDomains: ["finance"],
      drivenBy: `From your Finance figures: ${fin.title}`,
      evidenceAsOf: ctx.evidenceAsOf.finance ?? null,
      status: finCurrent ? "current" : "last_known",
      riskScore: null,
      level: SEVERITY_LEVEL[fin.severity],
      lastFlagged: !finCurrent,
      updateDataLabel: finCurrent ? null : "Finance",
    };
  }
  if (!hasCash) return UNKNOWN_DANGER("cashflow");
  return {
    ...dangerForDomain(ctx, "cashflow", "cashflow", input.cashflowSuperseded ? "Superseded by newer Finance figures" : null, true),
  };
}

/** The most severe current Finance risk finding, stated as what drives the Financial danger reading. */
function financialDrivenBy(findings: readonly OwnerFinding[]): string | null {
  const top = findings
    .filter((f) => f.domain === "finance" && f.findingType === "risk")
    .slice()
    .sort((a, b) => ownerSeverityRank(b.severity) - ownerSeverityRank(a.severity) || clampScore(b.impactScore) - clampScore(a.impactScore) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))[0];
  return top ? `Driven by: ${top.title}` : null;
}

/** Build the deterministic §19 owner-home summary. Pure; never invents values. */
export function buildOwnerHomeSummary(input: OwnerHomeSummaryInput): OwnerHomeSummary {
  const scoreByDomain = new Map<OwnerDomain, DomainScore>();
  for (const s of input.domainScores) scoreByDomain.set(s.domain, s);

  const businessHealthScore = clampScore(average(input.domainScores.map((s) => clampScore(s.healthScore))));
  const stale = new Set<string>(input.staleDomains ?? []);
  const dangerCtx: DangerContext = { scores: scoreByDomain, stale, evidenceAsOf: input.evidenceAsOf ?? {} };

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
    cashDanger: cashDanger(dangerCtx, input),
    // A Finance reading superseded by a newer, disagreeing Cash flow reading is never shown as current.
    financialDanger: tightenInProgress(
      dangerForDomain(dangerCtx, "financial", "finance", input.financeSuperseded ? "Superseded by newer Cash flow figures" : financialDrivenBy(input.findings), Boolean(input.financeSuperseded)),
      input.provisionalFinancial ? { state: input.provisionalFinancial.state, source: "finance" } : null,
      "financial survival (driven by profit and margin)"
    ),
    salesDanger: dangerForDomain(dangerCtx, "sales", "sales", null),
    operationsDanger: dangerForDomain(dangerCtx, "operations", "operations", null),
    executionDanger: executionDanger(dangerCtx),
    top3Risks,
    top3Opportunities,
    lastVerifiedImprovement,
    dataSufficiency,
    generatedAt: input.now ?? new Date(),
  };
}
