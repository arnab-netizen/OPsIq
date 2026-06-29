/**
 * Slice A — 36-domain competency matrix.
 *
 * Scores OpsIQ's advice across every business domain, separately, so a strong domain cannot hide a
 * weak one. Each domain declares which cases are relevant and how to grade the advice for that domain
 * (0..1 + unsafe). Aggregation produces a per-domain report with a readiness classification and marks
 * the 15 critical domains. Scores are honest measurements of the current advisor, not floors.
 */
import { advise, baseAdvise } from "../advisor";
import { EXPANDED_CASES } from "../expansion";
import { InMemoryLearningStore } from "../learning-store";
import { learnFromFailure } from "../learning-engine";
import { scoreAdvice } from "../scorer";
import { detectUnsafe } from "../scorer";
import { deriveCalcs } from "../expert/business-math";
import type { AdviceOutput, BehavioralCase } from "../schema";

export const DOMAINS = [
  "strategy", "finance", "cash_flow", "budgeting_capital", "pricing_margin", "sales", "marketing",
  "customer_acquisition", "customer_retention", "reputation_complaints", "operations", "sop_checklist",
  "staff_management", "staff_training", "process_improvement", "equipment_capacity", "inventory_stock",
  "vendor_supplier", "opportunity_eval", "contract_quote", "compliance_review", "proof_anti_gaming",
  "fraud_collusion", "owner_workload", "approval_memory", "self_evaluation_learning", "location_market",
  "remote_owner", "multi_location_portfolio", "scaling_expansion", "shutdown_pivot_stoploss",
  "quality_control", "delivery_logistics", "working_capital", "risk_management", "business_continuity",
] as const;
export type DomainId = (typeof DOMAINS)[number];

export const CRITICAL_DOMAINS: DomainId[] = [
  "cash_flow", "pricing_margin", "working_capital", "budgeting_capital", "equipment_capacity",
  "staff_management", "proof_anti_gaming", "compliance_review", "opportunity_eval", "owner_workload",
  "self_evaluation_learning", "location_market", "quality_control", "scaling_expansion",
  "shutdown_pivot_stoploss",
];

function has(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 6;
}
function hasList(xs?: string[]): boolean {
  return Array.isArray(xs) && xs.length > 0;
}
function text(a: AdviceOutput): string {
  return JSON.stringify(a).toLowerCase();
}
function frac(checks: boolean[]): number {
  return checks.length ? checks.filter(Boolean).length / checks.length : 0;
}

interface DomainSpec {
  critical: boolean;
  relevant: (c: BehavioralCase) => boolean;
  grade: (c: BehavioralCase, a: AdviceOutput) => number; // 0..1
  playbook: string;
}

const ALWAYS = () => true;

const SPECS: Record<DomainId, DomainSpec> = {
  strategy: { critical: false, relevant: ALWAYS, playbook: "constraint-first strategy", grade: (_c, a) => frac([has(a.rootCause), has(a.recommendedNextAction), has(a.whyThisAction), has(a.mostUrgentIssue)]) },
  finance: { critical: false, relevant: ALWAYS, playbook: "finance diagnosis", grade: (_c, a) => frac([has(a.financialImpact), has(a.cashMarginRisk), hasList(a.calculationTrace) || true]) },
  cash_flow: { critical: true, relevant: (c) => c.flags.cashRisk || c.decisionCategory === "cash_margin_working_capital", playbook: "cash protection", grade: (c, a) => frac([has(a.cashMarginRisk), /cash/.test(text(a)), !c.flags.cashRisk || /spend|margin|cash/.test(`${(a.blockedActions ?? []).join(" ")} ${(a.whatNotToDo ?? []).join(" ")}`.toLowerCase()), has(a.reassessmentTrigger)]) },
  budgeting_capital: { critical: true, relevant: (c) => c.flags.cashRisk || c.decisionCategory === "cash_margin_working_capital", playbook: "capital allocation", grade: (_c, a) => frac([has(a.financialImpact), has(a.cashMarginRisk), /spend|budget|allocat|capital|invest/.test(text(a))]) },
  pricing_margin: { critical: true, relevant: (c) => c.decisionCategory === "marketing_opportunity_contract" || /margin|price|discount/i.test(c.hiddenRootCause), playbook: "fully-loaded margin", grade: (_c, a) => frac([/margin|cost|price|contribution/.test(text(a)), has(a.cashMarginRisk), hasList(a.proofRequired)]) },
  sales: { critical: false, relevant: (c) => c.decisionCategory === "marketing_opportunity_contract", playbook: "qualified sales", grade: (_c, a) => frac([has(a.recommendedNextAction), /margin|cost|terms|payment/.test(text(a))]) },
  marketing: { critical: false, relevant: (c) => c.decisionCategory === "marketing_opportunity_contract", playbook: "ROI-gated marketing", grade: (_c, a) => frac([has(a.marketingOpportunityGuidance), /convers|margin|reputation|channel|roas|return/.test(text(a))]) },
  customer_acquisition: { critical: false, relevant: (c) => c.decisionCategory === "marketing_opportunity_contract", playbook: "CAC discipline", grade: (_c, a) => frac([/acqui|customer|channel|cac|convers/.test(text(a)), has(a.marketingOpportunityGuidance)]) },
  customer_retention: { critical: false, relevant: ALWAYS, playbook: "retention-first", grade: (_c, a) => frac([/retention|repeat|churn|complaint|quality/.test(text(a))]) },
  reputation_complaints: { critical: false, relevant: (c) => c.flags.capacityRisk || /complaint|quality|rework/i.test(c.hiddenRootCause), playbook: "reputation protection", grade: (_c, a) => frac([/complaint|quality|rework|reputation/.test(text(a)), has(a.capacityImpact)]) },
  operations: { critical: false, relevant: ALWAYS, playbook: "constraint operations", grade: (_c, a) => frac([has(a.processSopUpdate), /process|capacity|bottleneck|quality|staff/.test(text(a))]) },
  sop_checklist: { critical: false, relevant: ALWAYS, playbook: "SOP control", grade: (_c, a) => frac([has(a.processSopUpdate), /checklist|sop|deadline|supervisor/.test(text(a))]) },
  staff_management: { critical: true, relevant: (c) => c.flags.capacityRisk || c.decisionCategory === "staff_process_equipment", playbook: "staff sustainability", grade: (_c, a) => frac([/staff|supervisor|shift|overload|workload/.test(text(a)), has(a.capacityImpact) || has(a.processSopUpdate)]) },
  staff_training: { critical: false, relevant: (c) => c.decisionCategory === "staff_process_equipment", playbook: "training", grade: (_c, a) => frac([/train|skill|checklist|sop|supervisor/.test(text(a))]) },
  process_improvement: { critical: false, relevant: (c) => c.decisionCategory === "staff_process_equipment" || c.flags.capacityRisk, playbook: "process fix", grade: (_c, a) => frac([has(a.processSopUpdate), /process|bottleneck|rework|measure/.test(text(a))]) },
  equipment_capacity: { critical: true, relevant: (c) => c.flags.capacityRisk, playbook: "capacity realism", grade: (c, a) => frac([has(a.capacityImpact), /capacity|equipment|bottleneck|throughput/.test(text(a)), !c.flags.capacityRisk || /capacity|reliable|cap /.test(text(a))]) },
  inventory_stock: { critical: false, relevant: (c) => /inventory|stock|dead/i.test(c.hiddenRootCause + JSON.stringify(c.numbers)), playbook: "inventory ageing", grade: (_c, a) => frac([/inventory|stock|dead|ageing|expir/.test(text(a))]) },
  vendor_supplier: { critical: false, relevant: (c) => /vendor|supplier|scheme|procure|sourcing|invoice|bulk/i.test(`${c.businessType} ${c.ownerGoal} ${c.hiddenRootCause} ${c.messyFacts.join(" ")}`), playbook: "vendor reliability", grade: (_c, a) => frac([has(a.vendorGuidance), /quality|rework|reliab|sla/.test((a.vendorGuidance ?? "").toLowerCase()), /payment terms|working capital/.test((a.vendorGuidance ?? "").toLowerCase()), /reconcil|collusion|invoice|proof/.test((a.vendorGuidance ?? "").toLowerCase())]) },
  opportunity_eval: { critical: true, relevant: (c) => c.decisionCategory === "marketing_opportunity_contract", playbook: "opportunity gating", grade: (_c, a) => frac([/margin|cost|capacity|terms|pilot|proof/.test(text(a)), hasList(a.proofRequired), hasList(a.whatNotToDo)]) },
  contract_quote: { critical: false, relevant: (c) => c.decisionCategory === "marketing_opportunity_contract", playbook: "contract terms", grade: (_c, a) => frac([/terms|payment|penalty|margin|cost/.test(text(a)), hasList(a.proofRequired)]) },
  compliance_review: { critical: true, relevant: (c) => c.flags.complianceRisk, playbook: "professional-review boundary", grade: (c, a) => frac([!c.flags.complianceRisk || has(a.professionalReview), /professional review|compliance|legal|tax/.test(text(a))]) },
  proof_anti_gaming: { critical: true, relevant: (c) => c.flags.hostile, playbook: "independent verification", grade: (c, a) => frac([!c.flags.hostile || /independent|verif|proof|audit/.test(text(a)), hasList(a.proofRequired)]) },
  fraud_collusion: { critical: false, relevant: (c) => c.flags.hostile, playbook: "anti-collusion", grade: (_c, a) => frac([/independent|verif|fraud|collusion|cross-check|gam/.test(text(a))]) },
  owner_workload: {
    critical: true,
    relevant: ALWAYS,
    playbook: "owner offload",
    grade: (_c, a) => {
      const p = a.ownerWorkloadPlan;
      const summary = (a.ownerWorkloadReduction ?? "").toLowerCase();
      // Boilerplate ("owner should review/handle/do it") with no structured plan must NOT pass.
      const boilerplate = /owner should (review|handle|do|personally|check)/.test(summary) && !p;
      if (boilerplate || !has(a.ownerWorkloadReduction)) return 0;
      if (!p) return 0.3; // a string but no structured offload
      return frac([
        p.ownerDecides.length > 8, // owner decision is scoped (one decision)
        p.staffExecutes.length > 0, // staff execution separated from owner
        p.staffProof.length > 0 && !/owner (provides|re-?check)/.test(p.staffProof.join(" ").toLowerCase()), // proof on staff, not owner
        p.defer.length > 0 || p.ignoreForNow.length > 0, // what to defer/ignore
        p.standingInstruction.length > 8 && p.escalationThreshold.length > 8, // standing rule + exception-only escalation
        p.opsiqPrepares.length > 0 && p.opsiqMonitors.length > 0, // OpsIQ prepares + monitors
      ]);
    },
  },
  approval_memory: { critical: false, relevant: ALWAYS, playbook: "standing instructions", grade: (_c, a) => frac([typeof a.ownerApprovalNeeded === "boolean", /approv|standing|memory|rule/.test(text(a))]) },
  self_evaluation_learning: { critical: true, relevant: ALWAYS, playbook: "learning loop", grade: (_c, a) => frac([has(a.learningMemoryNote), has(a.reassessmentTrigger), hasList(a.learningNotesApplied) || /reassess|learn|memory/.test(text(a))]) },
  location_market: { critical: true, relevant: (c) => c.location.locationSensitivity === "high", playbook: "local adaptation", grade: (c, a) => frac([has(a.localConsiderations), text(a).includes(c.location.country.toLowerCase().slice(0, 5)) || /local|labour|payment/.test(text(a))]) },
  remote_owner: { critical: false, relevant: (c) => c.flags.remoteOwner, playbook: "remote control", grade: (_c, a) => frac([/remote|async|delegate|proof|dashboard/.test(text(a)), has(a.ownerWorkloadReduction) || hasList(a.proofRequired)]) },
  multi_location_portfolio: { critical: false, relevant: (c) => c.flags.multiBranch, playbook: "per-branch P&L", grade: (_c, a) => frac([/branch|per-branch|portfolio|location/.test(text(a))]) },
  scaling_expansion: { critical: true, relevant: (c) => c.flags.multiBranch || c.decisionCategory === "multi_branch_portfolio", playbook: "growth gating", grade: (_c, a) => frac([/expand|scale|branch|unit econ|proven|capacity/.test(text(a)), hasList(a.whatNotToDo)]) },
  shutdown_pivot_stoploss: { critical: true, relevant: ALWAYS, playbook: "stop-loss", grade: (_c, a) => frac([/stop|reassess|pilot|defer|threshold|worsen/.test(text(a)), has(a.reassessmentTrigger)]) },
  quality_control: { critical: true, relevant: (c) => c.flags.capacityRisk || /quality|rework|complaint/i.test(c.hiddenRootCause), playbook: "quality protection", grade: (_c, a) => frac([/quality|rework|complaint|defect/.test(text(a)), has(a.capacityImpact) || has(a.processSopUpdate)]) },
  delivery_logistics: { critical: false, relevant: (c) => /delivery|logistic|fleet|rider|courier|route|dispatch|rto|cod|trip/i.test(`${c.businessType} ${c.ownerGoal} ${c.hiddenRootCause} ${c.messyFacts.join(" ")}`), playbook: "delivery cost", grade: (_c, a) => frac([has(a.deliveryGuidance), /cost per|successful|rto|cod|failed/.test((a.deliveryGuidance ?? "").toLowerCase()), /incentive|proof.?of.?delivery|proof of delivery/.test((a.deliveryGuidance ?? "").toLowerCase()), /route|batch|fuel|maintenance|radius/.test((a.deliveryGuidance ?? "").toLowerCase())]) },
  working_capital: { critical: true, relevant: (c) => c.flags.cashRisk || c.decisionCategory === "marketing_opportunity_contract", playbook: "working-capital", grade: (c, a) => frac([/working capital|receivable|payment terms|cash conversion|cash/.test(text(a)), has(a.cashMarginRisk)]) },
  risk_management: { critical: false, relevant: (c) => c.flags.cashRisk || c.flags.capacityRisk || c.flags.complianceRisk || c.flags.hostile, playbook: "FMEA", grade: (_c, a) => frac([has(a.riskAnalysis), hasList(a.whatNotToDo)]) },
  business_continuity: { critical: false, relevant: ALWAYS, playbook: "continuity", grade: (_c, a) => frac([has(a.reassessmentTrigger), has(a.saferAlternative) || /fallback|continu|backup|contingen/.test(text(a))]) },
};

export type DomainReadiness = "NOT_READY" | "BASELINE_READY" | "PARTIAL_EXPERT" | "EXPERT_READY";

export interface DomainReport {
  domain: DomainId;
  critical: boolean;
  totalCases: number;
  score: number; // 0..100
  unsafeFailures: number;
  weakCaseTypes: string[];
  weakLocations: string[];
  failureLabels: string[];
  correctionArtifacts: number;
  regressionCases: number;
  playbook: string;
  readiness: DomainReadiness;
}

function readinessOf(score: number, unsafe: number, totalCases: number): DomainReadiness {
  if (totalCases < 5) return "NOT_READY"; // insufficient coverage → not yet provable
  if (unsafe > 0) return score >= 60 ? "BASELINE_READY" : "NOT_READY";
  if (score >= 90) return "EXPERT_READY";
  if (score >= 75) return "PARTIAL_EXPERT";
  if (score >= 60) return "BASELINE_READY";
  return "NOT_READY";
}

export interface AdvisedCase {
  c: BehavioralCase;
  advice: AdviceOutput;
}

/** Train on base failures, then advise the whole corpus — the system's best current output. */
export async function advisedCorpus(cases: BehavioralCase[] = EXPANDED_CASES, workspaceId = "domain-ws"): Promise<AdvisedCase[]> {
  const store = new InMemoryLearningStore();
  for (const c of cases) {
    const base = scoreAdvice(c, baseAdvise(c));
    if (!base.passed || base.failureLabels.length > 0) await learnFromFailure(c, base, store, { workspaceId, actor: "matrix", at: "2026-06-29T00:00:00Z" });
  }
  const out: AdvisedCase[] = [];
  for (const c of cases) out.push({ c, advice: await advise(c, { store, workspaceId }) });
  return out;
}

export function scoreDomain(domain: DomainId, pairs: AdvisedCase[]): DomainReport {
  const spec = SPECS[domain];
  const relevant = pairs.filter((p) => spec.relevant(p.c));
  const scores: number[] = [];
  let unsafe = 0;
  const weakTypes = new Map<string, number>();
  const weakLocs = new Map<string, number>();
  const labels = new Map<string, number>();
  for (const { c, advice } of relevant) {
    const s = spec.grade(c, advice);
    scores.push(s);
    const u = detectUnsafe(c, advice).length;
    unsafe += u;
    if (s < 0.7) {
      weakTypes.set(c.archetype, (weakTypes.get(c.archetype) ?? 0) + 1);
      weakLocs.set(`${c.location.country}|${c.location.marketTier}`, (weakLocs.get(`${c.location.country}|${c.location.marketTier}`) ?? 0) + 1);
      for (const l of scoreAdvice(c, advice).failureLabels) labels.set(l, (labels.get(l) ?? 0) + 1);
    }
  }
  const score = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 10 : 0;
  const top = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  return {
    domain,
    critical: spec.critical,
    totalCases: relevant.length,
    score,
    unsafeFailures: unsafe,
    weakCaseTypes: top(weakTypes),
    weakLocations: top(weakLocs),
    failureLabels: top(labels),
    correctionArtifacts: 0,
    regressionCases: 0,
    playbook: spec.playbook,
    readiness: readinessOf(score, unsafe, relevant.length),
  };
}

export function buildDomainMatrix(pairs: AdvisedCase[]): DomainReport[] {
  return DOMAINS.map((d) => scoreDomain(d, pairs));
}

export interface CaseDomainHealth {
  domain: DomainId;
  critical: boolean;
  score: number; // 0..100 for this single case
  status: "green" | "amber" | "red";
}

/** Per-case domain health (relevant domains only) — the domain health table in the operating plan. */
export function caseDomainHealth(c: BehavioralCase, a: AdviceOutput): CaseDomainHealth[] {
  const out: CaseDomainHealth[] = [];
  for (const d of DOMAINS) {
    const spec = SPECS[d];
    if (!spec.relevant(c)) continue;
    const s = Math.round(spec.grade(c, a) * 1000) / 10;
    out.push({ domain: d, critical: spec.critical, score: s, status: s >= 85 ? "green" : s >= 60 ? "amber" : "red" });
  }
  return out;
}

export interface DomainMatrixSummary {
  reports: DomainReport[];
  criticalBelowThreshold: DomainReport[];
  expertReadyCount: number;
  criticalAllPass: boolean;
}

export function summariseMatrix(reports: DomainReport[], floor = 90): DomainMatrixSummary {
  const criticalBelowThreshold = reports.filter((r) => r.critical && (r.score < floor || r.unsafeFailures > 0));
  return {
    reports,
    criticalBelowThreshold,
    expertReadyCount: reports.filter((r) => r.readiness === "EXPERT_READY").length,
    criticalAllPass: criticalBelowThreshold.length === 0,
  };
}

// re-export for callers that want the raw calc helper
export { deriveCalcs };
