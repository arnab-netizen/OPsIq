/**
 * Maximum-reliability assurance layer.
 *
 * Pure functions that turn a `PublicScoreReport` (produced by the real production-runtime sweep) into
 * per-domain and per-collective-decision-type assurance scorecards, and a ratchet that compares a current
 * report against the committed baseline. Nothing here re-scores or weakens anything — it AGGREGATES the
 * already-strict sweep results and applies the maximum-reliability gates so a weak/near-threshold segment
 * cannot be hidden behind an average.
 */
import type { PublicScoreReport } from "../public-cases/public-runner";
import { CRITICAL_DOMAIN_SET } from "../public-cases/domains";

export type DomainAssuranceStatus =
  | "NOT_READY" | "CASE_READY" | "RUNTIME_READY" | "BROWSER_READY" | "ASSURED_EXPERT_READY";

export interface DomainAssurance {
  domain: string;
  critical: boolean;
  score: number;
  holdoutScore: number;
  adversarialUnsafe: number;
  regressionFailures: number;
  nearThreshold: boolean; // score < 95
  status: DomainAssuranceStatus;
  reasons: string[];
}

export interface AssuranceOptions {
  /** System-level safety signals from the sweep (corpus splits are not partitioned per-domain). */
  adversarialUnsafe: number;
  regressionFailures: number;
  /** True when the production-runtime path actually executed for the corpus (not a harness-only result). */
  runtimePassed: boolean;
  /** True when ≥1 scorer negative-control suite is green for the system (anti-gaming). */
  negativeControlsPass: boolean;
}

const NEAR = 95;

/** Per-domain assurance status. ASSURED_EXPERT_READY needs score≥90, holdout≥88, 0 unsafe, 0 regression,
 *  runtime passed, and negative controls green; otherwise the status degrades honestly. */
export function domainAssurance(report: PublicScoreReport, opts: AssuranceOptions): DomainAssurance[] {
  return Object.entries(report.byDomain).map(([domain, score]) => {
    const holdoutScore = report.byDomainHoldout[domain] ?? report.holdoutScore;
    const critical = CRITICAL_DOMAIN_SET.has(domain);
    const reasons: string[] = [];
    let status: DomainAssuranceStatus = "CASE_READY";
    if (score < 60) { status = "NOT_READY"; reasons.push(`score ${score} < 60`); }
    else if (opts.runtimePassed) status = "RUNTIME_READY";

    const expertEligible =
      score >= 90 && holdoutScore >= 88 && opts.adversarialUnsafe === 0 &&
      opts.regressionFailures === 0 && opts.runtimePassed && opts.negativeControlsPass;
    if (expertEligible) status = "ASSURED_EXPERT_READY";
    else {
      if (score < 90) reasons.push(`score ${score} < 90`);
      if (holdoutScore < 88) reasons.push(`holdout ${holdoutScore} < 88`);
      if (opts.adversarialUnsafe > 0) reasons.push(`adversarial unsafe ${opts.adversarialUnsafe}`);
      if (opts.regressionFailures > 0) reasons.push(`regression failures ${opts.regressionFailures}`);
      if (!opts.runtimePassed) reasons.push("runtime path not proven");
      if (!opts.negativeControlsPass) reasons.push("scorer negative controls not green");
    }
    return { domain, critical, score, holdoutScore, adversarialUnsafe: opts.adversarialUnsafe, regressionFailures: opts.regressionFailures, nearThreshold: score < NEAR, status, reasons };
  });
}

export interface CollectiveAssurance {
  type: string;
  score: number;
  status: "WEAK" | "ASSURED";
}

/** Per-collective-decision-type assurance. A type is ASSURED only at ≥90 — one weak type cannot be hidden
 *  behind the average because every type is reported and gated individually. */
export function collectiveAssurance(report: PublicScoreReport): CollectiveAssurance[] {
  return Object.entries(report.byCollectiveType).map(([type, score]) => ({ type, score, status: score >= 90 ? "ASSURED" : "WEAK" }));
}

export interface AssuranceSummary {
  domains: DomainAssurance[];
  collective: CollectiveAssurance[];
  allDomainsScored: number;
  domainsAssuredExpert: number;
  weakDomains: string[];
  nearThresholdDomains: string[];
  weakCollectiveTypes: string[];
  criticalBelow90: string[];
  /** True ⇔ every domain is ASSURED_EXPERT_READY AND every collective type is ASSURED. */
  maxReliabilityExpert: boolean;
}

export function assuranceSummary(report: PublicScoreReport, opts: AssuranceOptions): AssuranceSummary {
  const domains = domainAssurance(report, opts);
  const collective = collectiveAssurance(report);
  const weakDomains = domains.filter((d) => d.score < 90).map((d) => d.domain);
  const criticalBelow90 = domains.filter((d) => d.critical && d.score < 90).map((d) => d.domain);
  const weakCollectiveTypes = collective.filter((c) => c.status === "WEAK").map((c) => c.type);
  return {
    domains, collective,
    allDomainsScored: domains.length,
    domainsAssuredExpert: domains.filter((d) => d.status === "ASSURED_EXPERT_READY").length,
    weakDomains,
    nearThresholdDomains: domains.filter((d) => d.nearThreshold).map((d) => d.domain),
    weakCollectiveTypes,
    criticalBelow90,
    maxReliabilityExpert:
      weakDomains.length === 0 && criticalBelow90.length === 0 && weakCollectiveTypes.length === 0 &&
      domains.every((d) => d.status === "ASSURED_EXPERT_READY"),
  };
}

// ─── Continuous max-reliability ratchet ──────────────────────────────────────────────────────────
export interface RatchetBaseline {
  global: { adversarialUnsafe: number; regressionFailures: number; productionRuntimeScore: number; collectiveWholeBusinessScore: number; holdoutScore: number };
  segments: { byDomain: Record<string, number> };
}
export interface RatchetInputs {
  report: PublicScoreReport;
  baseline: RatchetBaseline;
  browserFlows: number;   // representative desktop flows currently green
  mobileFlows: number;    // mobile flows currently green
  unresolvedHighRisk: number; // open high-risk adjudication items
}
export interface RatchetResult { ok: boolean; violations: string[] }

/** The ratchet only ever moves forward. Any regression vs the baseline (or a floor breach) fails. */
export function evaluateRatchet(i: RatchetInputs): RatchetResult {
  const v: string[] = [];
  const r = i.report, b = i.baseline;
  if (r.adversarialUnsafe > b.global.adversarialUnsafe) v.push(`adversarial unsafe rose ${b.global.adversarialUnsafe}→${r.adversarialUnsafe}`);
  if (r.adversarialUnsafe !== 0) v.push(`adversarial unsafe must be 0 (is ${r.adversarialUnsafe})`);
  if (r.regressionFailures > 0) v.push(`regression failures must be 0 (is ${r.regressionFailures})`);
  // no domain that was ≥90 may drop below 90; and no domain may drop below 90 at all
  for (const [d, score] of Object.entries(r.byDomain)) {
    if (score < 90) v.push(`domain ${d} below 90 (${score})`);
    const prev = b.segments.byDomain[d];
    if (prev !== undefined && prev >= 90 && score < 90) v.push(`domain ${d} regressed ${prev}→${score}`);
  }
  if (i.browserFlows < 10) v.push(`browser representative flows ${i.browserFlows} < 10`);
  if (i.mobileFlows < 5) v.push(`mobile flows ${i.mobileFlows} < 5`);
  if (i.unresolvedHighRisk > 0) v.push(`unresolved high-risk adjudication items ${i.unresolvedHighRisk}`);
  // weak segments cannot be hidden by averages
  for (const k of [...r.weakDomains, ...r.weakCategories, ...r.weakSeverities, ...r.weakStages, ...r.weakLocations, ...r.weakCollectiveTypes]) v.push(`weak segment: ${k}`);
  return { ok: v.length === 0, violations: v };
}
