/**
 * Owner Decision candidate-set diagnostics — MEASUREMENT ONLY.
 *
 * A pure, read-only analyzer for ONE Owner Decision candidate set. It reports how saturated the
 * 0..100 `priorityScore` is, how often candidates share a semantic class / severity, and — for every
 * same-class + same-severity group — which criterion of the REAL canonical comparator
 * (`compareOwnerCandidatesWithFactor`) actually decides the winner. It never re-implements the
 * comparator, never changes the order production elects, and never recalibrates a score.
 *
 * Contract:
 * - Pure: no I/O, no clock, no persistence, no logging. Inputs are never mutated or reordered.
 * - Privacy: the report carries only domains, classes, severities, finding codes, candidate ids and
 *   numbers. Titles, explanations, evidence and any other free text are never copied.
 * - Population is EXPLICIT and carried on every report (`report.population`):
 *   - "canonical-ranked": `analyzeCanonicalOwnerDecisionCandidateSet` runs the production
 *     `canonicalEligibility` (scope filter, stale-evidence replacement, safety-gate holds and blocker
 *     targets) and analyzes its `ranked` list — exactly the population `resolveOwnerDecision` ranks. No
 *     eligibility or gate logic is re-implemented here. Only this report has
 *     `exactCanonicalPopulation: true`.
 *   - "eligible-input": `analyzeOwnerDecisionCandidateSet(candidates, { population: "eligible-input" })`
 *     only filters the supplied array by `exclusion === null`. It does NOT model scope, stale
 *     replacement, gate holds or synthesized targets, so it is NOT the production contest unless the
 *     caller already passed the exact canonical ranked list. Its report says so
 *     (`exactCanonicalPopulation: false`).
 * - Scores are read through `clampScore` / `clampConfidence`, exactly as the comparator reads them, so
 *   "saturated" means "the comparator sees 100" (clampScore rounds, so 99.6 is seen as 100).
 *
 * Fixture or test statistics produced with this helper say nothing about real-customer incidence.
 */
import type { OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { clampConfidence, clampScore } from "./contracts";
import {
  canonicalEligibility,
  compareOwnerCandidatesWithFactor,
  isEligibleOwnerCandidate,
  rankOwnerCandidates,
  type OwnerDecisionCandidate,
  type OwnerPrecedenceFactor,
} from "./owner-decision";

/** The priority ceiling enforced by `clampScore`. */
export const OWNER_PRIORITY_SATURATION_CEILING = 100;

export const PRIORITY_SCORE_BUCKETS = ["0-24", "25-49", "50-74", "75-89", "90-94", "95-99", "100"] as const;
export type PriorityScoreBucket = (typeof PRIORITY_SCORE_BUCKETS)[number];

export function priorityScoreBucket(priorityScore: number): PriorityScoreBucket {
  const p = clampScore(priorityScore);
  if (p >= 100) return "100";
  if (p >= 95) return "95-99";
  if (p >= 90) return "90-94";
  if (p >= 75) return "75-89";
  if (p >= 50) return "50-74";
  if (p >= 25) return "25-49";
  return "0-24";
}

/** Comparator criteria that come AFTER priority: the ones that resolve a saturated priority. */
const LATER_FACTORS: readonly OwnerPrecedenceFactor[] = ["impact", "confidence", "effort", "identifier"];

const NO_SEVERITY = "none" as const;
type SeverityKey = "low" | "medium" | "high" | "critical" | typeof NO_SEVERITY;

export interface OwnerDecisionGroupMember {
  candidateId: string;
  findingCode: string;
  domain: string;
  priorityScore: number;
}

/** Shared by the same-class and same-class+same-severity group reports. */
interface GroupBase {
  priorityClass: string;
  size: number;
  /** Distinct domains among the members, sorted. */
  domains: string[];
  crossDomain: boolean;
  priorityScoresEqual: boolean;
  saturatedCount: number;
  anySaturated: boolean;
  allSaturated: boolean;
}

export interface SameClassGroup extends GroupBase {
  /** Distinct severities among the members, sorted (`none` = the source has no severity). */
  severities: string[];
  severitiesDiffer: boolean;
}

export interface SameClassSameSeverityGroup extends GroupBase {
  severity: string;
  /**
   * The comparator criterion that separates the winner (rank 1) from the runner-up (rank 2). Taken
   * from the real comparator, so it can also be `recorded_block` (a recorded compliance block) or
   * `current_evidence` (a refresh of out-of-date figures follows current work).
   */
  winnerFactor: OwnerPrecedenceFactor;
  /** Criterion separating each adjacent pair in comparator order (length = size - 1). */
  adjacentFactors: OwnerPrecedenceFactor[];
  winnerCandidateId: string;
  winnerFindingCode: string;
  /** Members in canonical comparator order. */
  ranked: OwnerDecisionGroupMember[];
  /** Two or more members are at the 100 ceiling: the priority score cannot separate them. */
  saturatedCollision: boolean;
  /**
   * Every member has the same priority, impact, confidence and effort and the same evidence currency:
   * only identifiers separate them. A 100-vs-100 collision is NOT necessarily a complete tie.
   */
  numericallyIdentical: boolean;
  /**
   * Priority carried no discrimination here (two or more members at 100) AND a LATER factor decided the
   * winner — i.e. a saturated priority was resolved by impact, confidence, effort or identifier.
   */
  saturationResolvedByLaterFactor: boolean;
}

export interface OwnerDecisionSaturationReport {
  eligibleCount: number;
  ceilingCount: number;
  /** Percent of eligible candidates at the ceiling (0 when there are none), rounded to 2 dp. */
  ceilingPercent: number;
  atLeast95Count: number;
  buckets: Record<PriorityScoreBucket, number>;
}

/** Which candidate population a report describes. */
export type OwnerDecisionDiagnosticsPopulation = "canonical-ranked" | "eligible-input";

/**
 * How the canonical comparator population was derived from the raw input (canonical analysis only).
 * Counts only; every figure comes from the production `canonicalEligibility` result.
 */
export interface CanonicalPopulationTrace {
  rawCount: number;
  /** Raw candidates for another business/workspace (dropped by the scope filter). */
  outOfScopeCount: number;
  /** In-scope candidates carrying a lifecycle exclusion on input (completed, cancelled, ...). */
  excludedOnInputCount: number;
  /** Candidates excluded because their evidence is stale (replaced by an explicit refresh target). */
  staleReplacedCount: number;
  /** Candidates the owner action gate holds (never ranked; the blocker is elected instead). */
  heldBySafetyGateCount: number;
  /** Ranked candidates that were not in the raw input (refresh targets and safety-gate blockers). */
  synthesizedCount: number;
  synthesizedBySource: Record<string, number>;
  /** Exact number of candidates entering the comparator. */
  rankedCount: number;
}

export interface OwnerDecisionCandidateSetReport {
  /** The population this report describes. Never infer "the production contest" without checking it. */
  population: OwnerDecisionDiagnosticsPopulation;
  /** True only when the population is the exact `resolveOwnerDecision` ranked list. */
  exactCanonicalPopulation: boolean;
  /** Present only for canonical-ranked reports. */
  populationTrace: CanonicalPopulationTrace | null;
  /** First candidate in comparator order within the analyzed population (null when empty). */
  topRankedCandidateId: string | null;
  totalCandidates: number;
  eligibleCandidates: number;
  excludedCandidates: number;
  byDomain: Record<string, number>;
  byClass: Record<string, number>;
  bySeverity: Record<string, number>;
  saturation: OwnerDecisionSaturationReport;
  /** Eligible candidates at the ceiling, by class (to see saturation across classes). */
  ceilingByClass: Record<string, number>;
  sameClassGroups: SameClassGroup[];
  sameClassSameSeverityGroups: SameClassSameSeverityGroup[];
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function sortedKeys<T>(m: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(m).sort()) out[k] = m[k];
  return out;
}

function severityKey(c: OwnerDecisionCandidate): SeverityKey {
  return (c.severity ?? NO_SEVERITY) as SeverityKey;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function memberOf(c: OwnerDecisionCandidate): OwnerDecisionGroupMember {
  return { candidateId: c.candidateId, findingCode: c.findingCode, domain: String(c.domain), priorityScore: clampScore(c.priorityScore) };
}

function groupBase(priorityClass: string, members: OwnerDecisionCandidate[]): GroupBase {
  const scores = members.map((m) => clampScore(m.priorityScore));
  const saturatedCount = scores.filter((s) => s === OWNER_PRIORITY_SATURATION_CEILING).length;
  const domains = Array.from(new Set(members.map((m) => String(m.domain)))).sort();
  return {
    priorityClass,
    size: members.length,
    domains,
    crossDomain: domains.length > 1,
    priorityScoresEqual: scores.every((s) => s === scores[0]),
    saturatedCount,
    anySaturated: saturatedCount > 0,
    allSaturated: saturatedCount === members.length,
  };
}

function allEqual<T>(values: readonly T[]): boolean {
  return values.every((v) => v === values[0]);
}

/**
 * Analyze a GENERAL candidate set: only the supplied candidates with `exclusion === null`. The caller
 * must state the population explicitly; the report is labelled `eligible-input` and
 * `exactCanonicalPopulation: false`. For the production contest use
 * `analyzeCanonicalOwnerDecisionCandidateSet`. Deterministic; inputs are never mutated or reordered.
 */
export function analyzeOwnerDecisionCandidateSet(
  candidates: readonly OwnerDecisionCandidate[],
  options: { population: "eligible-input" }
): OwnerDecisionCandidateSetReport {
  return analyzeCandidates(candidates, options.population, null);
}

/**
 * Analyze the EXACT population `resolveOwnerDecision` ranks: the production `canonicalEligibility(...).ranked`
 * for the same candidates and scope (business, workspace, optional owner-gate constraints). Reuses that
 * existing pure function — no eligibility, stale-replacement or safety-gate logic lives here.
 */
export function analyzeCanonicalOwnerDecisionCandidateSet(
  candidates: readonly OwnerDecisionCandidate[],
  /**
   * `gate` is REQUIRED so the caller states the safety state explicitly (governance: every canonical
   * resolution passes the owner action-gate constraints). Pass the same constraints production resolves
   * with; `null` means "model no safety state" (no action is held, no blocker is synthesized).
   */
  scope: { businessId: string; workspaceId: string; gate: OwnerGateConstraints | null }
): OwnerDecisionCandidateSetReport {
  const { processed, ranked, holds } = canonicalEligibility(candidates, { businessId: scope.businessId, workspaceId: scope.workspaceId, gate: scope.gate });
  const rawIds = new Set(candidates.map((c) => c.candidateId));
  const synthesized = ranked.filter((c) => !rawIds.has(c.candidateId));
  const synthesizedBySource: Record<string, number> = {};
  for (const c of synthesized) increment(synthesizedBySource, c.source);
  const rawExclusion = new Map(candidates.map((c) => [c.candidateId, c.exclusion]));
  const trace: CanonicalPopulationTrace = {
    rawCount: candidates.length,
    outOfScopeCount: candidates.length - processed.length,
    excludedOnInputCount: processed.filter((c) => rawExclusion.get(c.candidateId) !== null).length,
    // Stale replacement is applied by canonicalEligibility: a candidate eligible on input but excluded after.
    staleReplacedCount: processed.filter((c) => c.exclusion === "stale_evidence" && rawExclusion.get(c.candidateId) === null).length,
    heldBySafetyGateCount: holds.length,
    synthesizedCount: synthesized.length,
    synthesizedBySource: sortedKeys(synthesizedBySource),
    rankedCount: ranked.length,
  };
  return analyzeCandidates(ranked, "canonical-ranked", trace);
}

function analyzeCandidates(
  candidates: readonly OwnerDecisionCandidate[],
  population: OwnerDecisionDiagnosticsPopulation,
  populationTrace: CanonicalPopulationTrace | null
): OwnerDecisionCandidateSetReport {
  const eligible = candidates.filter(isEligibleOwnerCandidate);

  const byDomain: Record<string, number> = {};
  const byClass: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const ceilingByClass: Record<string, number> = {};
  const buckets = Object.fromEntries(PRIORITY_SCORE_BUCKETS.map((b) => [b, 0])) as Record<PriorityScoreBucket, number>;
  let ceilingCount = 0;
  let atLeast95Count = 0;

  for (const c of eligible) {
    increment(byDomain, String(c.domain));
    increment(byClass, c.priorityClass);
    increment(bySeverity, severityKey(c));
    const p = clampScore(c.priorityScore);
    buckets[priorityScoreBucket(p)] += 1;
    if (p >= 95) atLeast95Count += 1;
    if (p === OWNER_PRIORITY_SATURATION_CEILING) {
      ceilingCount += 1;
      increment(ceilingByClass, c.priorityClass);
    }
  }

  const byClassGroup = new Map<string, OwnerDecisionCandidate[]>();
  const byClassSeverityGroup = new Map<string, OwnerDecisionCandidate[]>();
  for (const c of eligible) {
    const k1 = c.priorityClass;
    const k2 = `${c.priorityClass}\u0000${severityKey(c)}`;
    (byClassGroup.get(k1) ?? byClassGroup.set(k1, []).get(k1)!).push(c);
    (byClassSeverityGroup.get(k2) ?? byClassSeverityGroup.set(k2, []).get(k2)!).push(c);
  }

  const sameClassGroups: SameClassGroup[] = [];
  for (const [priorityClass, members] of [...byClassGroup.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (members.length < 2) continue;
    const severities = Array.from(new Set(members.map(severityKey))).sort();
    sameClassGroups.push({ ...groupBase(priorityClass, members), severities, severitiesDiffer: severities.length > 1 });
  }

  const sameClassSameSeverityGroups: SameClassSameSeverityGroup[] = [];
  for (const [key, members] of [...byClassSeverityGroup.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (members.length < 2) continue;
    const [priorityClass, severity] = key.split("\u0000");
    // Sort a COPY with the real comparator; the caller's array is never reordered.
    const ordered = [...members].sort((a, b) => compareOwnerCandidatesWithFactor(a, b)[0]);
    const adjacentFactors: OwnerPrecedenceFactor[] = [];
    for (let i = 0; i < ordered.length - 1; i++) adjacentFactors.push(compareOwnerCandidatesWithFactor(ordered[i], ordered[i + 1])[1]);
    const base = groupBase(priorityClass, members);
    const winnerFactor = adjacentFactors[0];
    const saturatedCollision = base.saturatedCount >= 2;
    sameClassSameSeverityGroups.push({
      ...base,
      severity,
      winnerFactor,
      adjacentFactors,
      winnerCandidateId: ordered[0].candidateId,
      winnerFindingCode: ordered[0].findingCode,
      ranked: ordered.map(memberOf),
      saturatedCollision,
      numericallyIdentical:
        allEqual(members.map((m) => clampScore(m.priorityScore))) &&
        allEqual(members.map((m) => clampScore(m.expectedImpactScore))) &&
        allEqual(members.map((m) => clampConfidence(m.confidence))) &&
        allEqual(members.map((m) => clampScore(m.effortScore))) &&
        allEqual(members.map((m) => m.source === "evidence_refresh")),
      saturationResolvedByLaterFactor: saturatedCollision && LATER_FACTORS.includes(winnerFactor),
    });
  }

  return {
    population,
    exactCanonicalPopulation: population === "canonical-ranked",
    populationTrace,
    topRankedCandidateId: rankOwnerCandidates(eligible)[0]?.candidateId ?? null,
    totalCandidates: candidates.length,
    eligibleCandidates: eligible.length,
    excludedCandidates: candidates.length - eligible.length,
    byDomain: sortedKeys(byDomain),
    byClass: sortedKeys(byClass),
    bySeverity: sortedKeys(bySeverity),
    saturation: {
      eligibleCount: eligible.length,
      ceilingCount,
      ceilingPercent: eligible.length > 0 ? round2((ceilingCount / eligible.length) * 100) : 0,
      atLeast95Count,
      buckets,
    },
    ceilingByClass: sortedKeys(ceilingByClass),
    sameClassGroups,
    sameClassSameSeverityGroups,
  };
}

export interface OwnerDecisionMeasurementSummary {
  candidateSets: number;
  /** Sets whose population is the exact canonical comparator population. */
  canonicalPopulationSets: number;
  /** Sets that only filtered the supplied array (NOT the exact production contest). */
  eligibleInputPopulationSets: number;
  /** True only when every summarized set is an exact canonical population. */
  allExactCanonical: boolean;
  totalCandidates: number;
  eligibleCandidates: number;
  ceilingCount: number;
  ceilingPercent: number;
  atLeast95Count: number;
  buckets: Record<PriorityScoreBucket, number>;
  sameClassGroups: number;
  sameClassCrossDomainGroups: number;
  sameClassSameSeverityGroups: number;
  sameClassSameSeverityCrossDomainGroups: number;
  saturatedCollisionGroups: number;
  saturationResolvedByLaterFactorGroups: number;
  numericallyIdenticalGroups: number;
  /** Winner factor of each same-class + same-severity group. */
  winnerFactorCounts: Partial<Record<OwnerPrecedenceFactor, number>>;
  /** Winner factor of each saturated same-class + same-severity group (the central question). */
  saturatedCollisionWinnerFactorCounts: Partial<Record<OwnerPrecedenceFactor, number>>;
}

/** Aggregate several reports (e.g. across test fixtures). Pure; labels nothing as production data. */
export function summarizeOwnerDecisionReports(reports: readonly OwnerDecisionCandidateSetReport[]): OwnerDecisionMeasurementSummary {
  const buckets = Object.fromEntries(PRIORITY_SCORE_BUCKETS.map((b) => [b, 0])) as Record<PriorityScoreBucket, number>;
  const winner: Partial<Record<OwnerPrecedenceFactor, number>> = {};
  const saturatedWinner: Partial<Record<OwnerPrecedenceFactor, number>> = {};
  let totalCandidates = 0, eligible = 0, ceiling = 0, ge95 = 0, scg = 0, scgCross = 0, scsg = 0, scsgCross = 0, sat = 0, resolved = 0, identical = 0;
  for (const r of reports) {
    totalCandidates += r.totalCandidates;
    eligible += r.eligibleCandidates;
    ceiling += r.saturation.ceilingCount;
    ge95 += r.saturation.atLeast95Count;
    for (const b of PRIORITY_SCORE_BUCKETS) buckets[b] += r.saturation.buckets[b];
    scg += r.sameClassGroups.length;
    scgCross += r.sameClassGroups.filter((g) => g.crossDomain).length;
    for (const g of r.sameClassSameSeverityGroups) {
      scsg += 1;
      if (g.crossDomain) scsgCross += 1;
      if (g.numericallyIdentical) identical += 1;
      if (g.saturationResolvedByLaterFactor) resolved += 1;
      winner[g.winnerFactor] = (winner[g.winnerFactor] ?? 0) + 1;
      if (g.saturatedCollision) {
        sat += 1;
        saturatedWinner[g.winnerFactor] = (saturatedWinner[g.winnerFactor] ?? 0) + 1;
      }
    }
  }
  const canonicalSets = reports.filter((r) => r.exactCanonicalPopulation).length;
  return {
    candidateSets: reports.length,
    canonicalPopulationSets: canonicalSets,
    eligibleInputPopulationSets: reports.length - canonicalSets,
    allExactCanonical: reports.length > 0 && canonicalSets === reports.length,
    totalCandidates,
    eligibleCandidates: eligible,
    ceilingCount: ceiling,
    ceilingPercent: eligible > 0 ? round2((ceiling / eligible) * 100) : 0,
    atLeast95Count: ge95,
    buckets,
    sameClassGroups: scg,
    sameClassCrossDomainGroups: scgCross,
    sameClassSameSeverityGroups: scsg,
    sameClassSameSeverityCrossDomainGroups: scsgCross,
    saturatedCollisionGroups: sat,
    saturationResolvedByLaterFactorGroups: resolved,
    numericallyIdenticalGroups: identical,
    winnerFactorCounts: winner,
    saturatedCollisionWinnerFactorCounts: saturatedWinner,
  };
}
