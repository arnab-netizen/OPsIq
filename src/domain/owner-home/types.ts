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

/** A named danger surface on the owner home (cash / sales / operations / execution). */
export interface DomainDanger {
  /** The domain key, or "execution" for the operations+sop execution rollup. */
  key: OwnerDomain | "execution";
  riskScore: number | null; // null = no diagnosis for this surface (never invented)
  level: DangerLevel;
  /** true when the reading comes from out-of-date evidence: shown as last flagged, never current. */
  lastFlagged?: boolean;
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
  cashDanger: DomainDanger;
  salesDanger: DomainDanger;
  operationsDanger: DomainDanger;
  executionDanger: DomainDanger;
  top3Risks: OwnerHomeRisk[];
  top3Opportunities: OwnerHomeOpportunity[];
  lastVerifiedImprovement: VerifiedImprovement | null;
  dataSufficiency: OwnerHomeDataSufficiency;
  generatedAt: Date;
}
