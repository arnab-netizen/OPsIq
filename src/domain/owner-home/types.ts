/**
 * Owner Home & Mobile Usability (Module 12) — shared types.
 *
 * Pure types for the deterministic Owner Home Summary: the exact set of things the
 * §19 owner home screen must show — business health; cash/sales/operations/execution
 * danger; the top 3 risks; the top 3 opportunities; and the last verified improvement. Today's
 * ranked actions are the canonical owner decision, not part of this summary. Pure data only
 * (no DB, no I/O, no LLM). Nothing here is invented: a domain with no diagnosis is reported as
 * `unknown`, never as 0 danger.
 */
import type { OwnerDomain, OwnerSeverity } from "@/domain/owner-spine/contracts";

/** Danger banding for a single domain's risk (or "unknown" when there is no data). */
export type DangerLevel = "unknown" | "none" | "low" | "elevated" | "high" | "critical";

/**
 * A named danger surface on the owner home (cash / financial / sales / operations / execution). One
 * contract for every card: which domain's evidence drives it, when that evidence was captured, and
 * whether the reading is current. A score is shown only for a CURRENT reading; out-of-date evidence
 * shows only its last-known level ("Last flagged: High — update … data").
 */
export interface DomainDanger {
  /** The card: a domain key, "execution" (operations + sop rollup) or "financial" (Finance). */
  key: OwnerDomain | "execution" | "financial";
  /** The domain(s) whose evidence produced this reading (empty when unknown). */
  sourceDomains: OwnerDomain[];
  /** What drives the reading, shown as provenance (e.g. "Driven by: Gross margin below target"); null when not stated. */
  drivenBy: string | null;
  /** When the evidence behind the reading was captured (the oldest, for a rollup); null when unknown. */
  evidenceAsOf: Date | null;
  /**
   * current = evidence in date; last_known = out of date (or superseded) — shown as last flagged;
   * conflicting = two current readings disagree and neither is more current (shown as a conflict, never
   * resolved by picking one); unknown = no diagnosis.
   */
  status: "current" | "last_known" | "conflicting" | "unknown";
  /** 0..100, ONLY for a current reading from a scored domain; null otherwise (never invented, never stale). */
  riskScore: number | null;
  /** The current level, or the last-known level when status is last_known. */
  level: DangerLevel;
  /** true exactly when status is last_known. */
  lastFlagged: boolean;
  /** Owner-facing name of the data to update when the reading is last-known (e.g. "Execution"). */
  updateDataLabel: string | null;
}

/** A top risk surfaced on the home screen (a real risk finding). */
export interface OwnerHomeRisk {
  domain: OwnerDomain;
  code: string;
  title: string;
  summary: string;
  severity: OwnerSeverity;
  impactScore: number; // 0..100
  confidence: number; // 0..1
  /** true when the finding's evidence is out of date: its severity is what it last showed. */
  lastFlagged: boolean;
}

/** A top opportunity surfaced on the home screen (a real opportunity finding). */
export interface OwnerHomeOpportunity {
  domain: OwnerDomain;
  code: string;
  title: string;
  summary: string;
  impactScore: number; // 0..100
  confidence: number; // 0..1
  /** true when the finding's evidence is out of date. */
  lastFlagged: boolean;
}

/** A real, recorded before/after improvement that was verified as an improvement. */
export interface VerifiedImprovement {
  domain: OwnerDomain;
  actionTitle: string;
  metric: string;
  beforeValue: number | null;
  afterValue: number | null;
  verifiedAt: Date;
}

/**
 * Jarvis 360 Slice 1 — owner-facing data-sufficiency disclosure surfaced on the
 * command-center home. Uses the WORST domain confidence so a single stale/missing
 * domain is never averaged away.
 */
export interface OwnerHomeDataSufficiency {
  status: "sufficient" | "caution" | "insufficient";
  lowestDataConfidenceScore: number; // 0..100 (worst domain)
  lowConfidenceDomains: string[];
  missingCriticalData: string[];
}

/** The complete §19 owner-home summary (deterministic; nothing invented). */
export interface OwnerHomeSummary {
  businessHealthScore: number; // 0..100
  /** Cash position only (Cash flow, or Finance's own cash-survival findings) — never margin or profit risk. */
  cashDanger: DomainDanger;
  /** Finance's overall risk, with what drives it (margin, debt, cash …) stated as provenance. */
  financialDanger: DomainDanger;
  salesDanger: DomainDanger;
  operationsDanger: DomainDanger;
  executionDanger: DomainDanger;
  top3Risks: OwnerHomeRisk[];
  top3Opportunities: OwnerHomeOpportunity[];
  lastVerifiedImprovement: VerifiedImprovement | null;
  dataSufficiency: OwnerHomeDataSufficiency;
  generatedAt: Date;
}
