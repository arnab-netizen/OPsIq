/**
 * The ONE advice policy (owner-spine/owner-advice-policy.ts): what OpsIQ may claim or recommend from the elected target.
 * Pure. Confidence stays a heuristic of evidence strength — nothing here is a probability, a new score or a new threshold,
 * and nothing here changes which candidate wins (canonical ranking is pinned elsewhere).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  OWNER_ADVICE_MODES,
  OWNER_CLAIM_TYPES,
  resolveOwnerAdvicePolicy,
  type OwnerAdvicePolicy,
} from "@/domain/owner-spine/owner-advice-policy";
import {
  classifyOwnerFindingCode,
  resolveOwnerDecision,
  type CurrentOwnerDecision,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { NO_OWNER_GATE_CONSTRAINTS, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { buildOwnerControlCenter } from "@/domain/owner-mode/owner-control-center";
import { DATA_CONFIDENCE_CAUTION, DATA_CONFIDENCE_INSUFFICIENT } from "@/domain/owner-spine/contracts";
import { dangerLevel } from "@/domain/owner-home/summary";
import { SCORE_SEMANTICS_NAMES } from "@/domain/owner-spine/score-semantics";
import { THRESHOLD_REGISTRY } from "@/domain/owner-spine/threshold-provenance";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const BIZ = "biz-1";
const WS = "ws-1";
const NOW = new Date("2026-09-27T12:00:00Z");

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string; domain: OwnerDecisionCandidate["domain"] }): OwnerDecisionCandidate {
  const sourceId = p.sourceId ?? `${p.findingCode}-${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    candidateId: p.candidateId ?? `${p.source ?? "domain_action"}:${sourceId}`,
    businessId: BIZ, workspaceId: WS, source: p.source ?? "domain_action", domain: p.domain, sourceId,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: p.findingId ?? null,
    title: p.title, explanation: p.explanation ?? "", severity: p.severity === undefined ? "high" : p.severity, priorityScore: p.priorityScore ?? 60,
    expectedImpactScore: 50, confidence: p.confidence ?? 0.9, effortScore: 40, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: p.missingData ?? [], verificationMetric: null, evidenceAsOf: null, stale: p.stale ?? false, exclusion: null,
    targetRoute: `/owner/${p.domain}`,
  };
}
function input(candidates: OwnerDecisionCandidate[], over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    businessId: BIZ, workspaceId: WS, candidates, diagnosedDomains: ["finance", "marketing", "sales", "cashflow", "operations"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "test" }, changeFacts: NO_CHANGE_FACTS, gate: null, now: NOW, ...over,
  };
}
const suff = (status: "sufficient" | "caution" | "insufficient", low: string[] = [], missing: string[] = []) => ({
  status, lowestDataConfidenceScore: status === "sufficient" ? 90 : status === "caution" ? 60 : 20, lowConfidenceDomains: low, missingCriticalData: missing,
});
const gate = (over: Partial<OwnerGateConstraints>): OwnerGateConstraints => ({ ...NO_OWNER_GATE_CONSTRAINTS, ...over });
const sales = () => cand({ findingCode: "SALES_LOW_CONVERSION", title: "Raise conversion", domain: "sales" });
const growth = () => cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing" });
const policyOf = (d: CurrentOwnerDecision): OwnerAdvicePolicy => d.advicePolicy;

describe("1. no data: no fabricated recommendation, explicit evidence request", () => {
  const d = resolveOwnerDecision(input([], { diagnosedDomains: [], dataSufficiency: suff("insufficient") }));
  it("abstains from a target and asks for the numbers", () => {
    expect(d.state).toBe("NO_EVIDENCE");
    expect(d.primaryTarget).toBeNull();
    expect(policyOf(d).mode).toBe("EVIDENCE_REQUIRED");
    expect(policyOf(d).canAct).toBe(false);
    expect(policyOf(d).canMakeMaterialCommitment).toBe(false);
    expect(policyOf(d).nextEvidenceAction).toMatch(/Add your business numbers/);
  });
});

describe("2. missing critical target data: material recommendation abstains, fields named, next action exists", () => {
  const d = resolveOwnerDecision(input(
    [cand({ findingCode: "FIN_MISSING_CRITICAL_DATA", title: "Add your cash and costs", domain: "finance", missingData: ["cashOnHand", "costs"], confidence: 1 }), growth()],
    { dataSufficiency: suff("insufficient", ["finance"], ["cashOnHand", "costs"]) }
  ));
  it("is EVIDENCE_REQUIRED with named missing evidence and no commitment", () => {
    expect(d.primaryTarget?.findingCode).toBe("FIN_MISSING_CRITICAL_DATA");
    const p = policyOf(d);
    expect(p.mode).toBe("EVIDENCE_REQUIRED");
    expect(p.canMakeMaterialCommitment).toBe(false);
    expect(p.missingEvidence.join(" ")).toMatch(/cashOnHand|cash/i);
    expect(p.nextEvidenceAction).toMatch(/^Provide:/);
  });
  it("a request for evidence is never presented as 'High confidence' by the card", () => {
    const html = renderToStaticMarkup(createElement(OwnerDecisionCard, { decision: d }));
    expect(html).toContain("Needs your information");
    expect(html).not.toContain("High confidence");
  });
});

describe("3/15. stale high-severity diagnosis: not claimed as current; refresh wins by the existing canonical rules", () => {
  const d = resolveOwnerDecision(input(
    [cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "Cash runs out", domain: "cashflow", severity: "critical", stale: true }), sales()],
    { staleDomains: ["cashflow"] }
  ));
  it("elects the refresh target and requires a refresh", () => {
    expect(d.primaryTarget?.source).toBe("evidence_refresh");
    const p = policyOf(d);
    expect(p.mode).toBe("REFRESH_REQUIRED");
    expect(p.requiresEvidenceRefresh).toBe(true);
    expect(p.canMakeMaterialCommitment).toBe(false);
    expect(p.nextEvidenceAction).toMatch(/Update the .* figures/);
  });
  it("never states the old danger as a current fact", () => {
    const text = [policyOf(d).ownerStatement, ...policyOf(d).reasons, ...d.whyThisWins].join(" ");
    expect(text).toMatch(/out of date/i);
    expect(text).not.toMatch(/cash runs out/i);
    expect(d.primaryConcernClass).toBe("MISSING_CRITICAL_EVIDENCE");
  });
  it("the card labels it as a confirmation, not a confidence", () => {
    const html = renderToStaticMarkup(createElement(OwnerDecisionCard, { decision: d }));
    expect(html).toContain("Confirm the figures first");
    expect(html).toContain("Last flagged");
    expect(html).not.toContain("High confidence");
  });
});

describe("4/5. current sufficient and caution diagnoses", () => {
  it("sufficient + current: ordinary recommendation, no qualifier", () => {
    const p = policyOf(resolveOwnerDecision(input([sales()])));
    expect(p.mode).toBe("SUPPORTED");
    expect(p.canAct).toBe(true);
    expect(p.canMakeMaterialCommitment).toBe(true);
    expect(p.nextEvidenceAction).toBe("");
  });
  it("caution: qualified, capped, and never worded as a probability", () => {
    const d = resolveOwnerDecision(input([sales()], { dataSufficiency: suff("caution", ["marketing"]) }));
    expect(policyOf(d).mode).toBe("CAUTION");
    expect(d.confidence.score).toBeLessThanOrEqual(70);
    expect(policyOf(d).ownerStatement).not.toMatch(/%|probab|chance|likely/i);
  });
});

describe("6/7/8. recorded facts are not made uncertain by unrelated data gaps", () => {
  const insufficient = suff("insufficient", ["marketing"], ["cashOnHand"]);
  it("a recorded compliance breach stays a fact at its own confidence", () => {
    const d = resolveOwnerDecision(input(
      [cand({ findingCode: "COMPLIANCE_BREACH", title: "Fire certificate expired", domain: "compliance", source: "compliance_item", severity: "critical", priorityScore: 0 }), sales()],
      { dataSufficiency: insufficient }
    ));
    expect(d.primaryTarget?.title).toBe("Fire certificate expired");
    expect(policyOf(d).mode).toBe("RECORDED_FACT");
    expect(policyOf(d).claimType).toBe("RECORDED_FACT");
    expect(d.confidence.capped).toBe(false);
    expect(policyOf(d).reasons.join(" ")).toMatch(/recorded fact/i);
  });
  it("a recorded business risk stays a fact", () => {
    const d = resolveOwnerDecision(input(
      [cand({ findingCode: "BUSINESS_RISK_CRITICAL", title: "Key supplier exit", domain: "risk", source: "business_risk", severity: "critical", priorityScore: 80, confidence: 0.6 })],
      { dataSufficiency: insufficient }
    ));
    expect(policyOf(d).mode).toBe("RECORDED_FACT");
    expect(d.confidence.capped).toBe(false);
  });
  it("a safety gate resting on a recorded fact remains enforceable and a fact", () => {
    const d = resolveOwnerDecision(input([growth()], { dataSufficiency: insufficient, gate: gate({ expiredCompliance: { name: "Trade licence", kind: "licence" } }) }));
    expect(d.primaryTarget?.findingCode).toBe("GATE_COMPLIANCE_EXPIRED");
    expect(policyOf(d).mode).toBe("RECORDED_FACT");
    expect(d.confidence.capped).toBe(false);
  });
});

describe("5 (target-relevant). insufficiency elsewhere is distinguished from insufficiency in the target's own area", () => {
  it("unrelated area incomplete: caution, target area sufficient, no commitment on growth, numbers unchanged (still capped)", () => {
    const d = resolveOwnerDecision(input([growth()], { dataSufficiency: suff("insufficient", ["finance"], []) }));
    const p = policyOf(d);
    expect(p.mode).toBe("CAUTION");
    expect(p.targetEvidence).toBe("TARGET_AREA_SUFFICIENT");
    expect(p.canMakeMaterialCommitment).toBe(false);
    expect(d.confidence.score).toBe(40); // existing business-wide cap unchanged
  });
  it("target's own area incomplete: provisional", () => {
    const p = policyOf(resolveOwnerDecision(input([sales()], { dataSufficiency: suff("insufficient", ["sales"], []) })));
    expect(p.mode).toBe("PROVISIONAL");
    expect(p.targetEvidence).toBe("TARGET_AREA_INCOMPLETE");
    expect(p.ownerStatement).toMatch(/needs attention now/);
  });
});

describe("9/10/11. data-derived gates, conflicts and provisional figures", () => {
  const cashGate = (over: Partial<OwnerGateConstraints["cash"]>) => gate({ cash: { gateState: "CRITICAL", basis: "", driver: "cash", confidence: 0.8, ...over } });
  it("a data-derived gate with weak evidence stays capped and is not a recorded fact", () => {
    const d = resolveOwnerDecision(input([growth()], { dataSufficiency: suff("insufficient"), gate: gate({ grossMarginPct: 5, grossMarginConfidence: 0.9 }) }));
    expect(d.primaryTarget?.findingCode).toBe("GATE_MARGIN_BELOW_FLOOR");
    expect(d.confidence.capped).toBe(true);
    expect(policyOf(d).mode).not.toBe("RECORDED_FACT");
  });
  it("conflicting cash/finance: no winner is picked; the owner is told what resolves it", () => {
    const d = resolveOwnerDecision(input([growth()], { gate: cashGate({ conflicting: true }) }));
    expect(d.primaryTarget?.findingCode).toBe("GATE_CASH_UNSAFE");
    const p = policyOf(d);
    expect(p.mode).toBe("CONFLICT_REQUIRES_RESOLUTION");
    expect(p.canMakeMaterialCommitment).toBe(false);
    expect(p.nextEvidenceAction).toMatch(/Cash flow and Finance/);
    expect(p.ownerStatement).toMatch(/disagree/);
  });
  it("in-progress figures: provisional, may tighten, never authorize growth", () => {
    const d = resolveOwnerDecision(input([growth()], { gate: cashGate({ provisional: true }), provisionalDomains: ["finance"] }));
    const p = policyOf(d);
    expect(p.mode).toBe("PROVISIONAL");
    expect(p.canMakeMaterialCommitment).toBe(false);
    expect(d.missingInformation.join(" ")).toMatch(/never to clear a problem or approve growth/);
  });
  it("a provisional-only business is not told advice rests on a completed period that does not exist", () => {
    const d = resolveOwnerDecision(input([], { diagnosedDomains: [], dataSufficiency: suff("insufficient"), provisionalDomains: ["sales"] }));
    expect(d.missingInformation.join(" ")).not.toMatch(/Advice rests on the latest completed period/);
    expect(d.missingInformation.join(" ")).toMatch(/Add figures for a completed period/);
  });
});

describe("12. missing or stale evidence is never read as 'resolved'", () => {
  it("no open actions + insufficient or stale evidence is not SUPPORTED", () => {
    const stale = policyOf(resolveOwnerDecision(input([], { staleDomains: ["sales"] })));
    expect(stale.mode).toBe("REFRESH_REQUIRED");
    const thin = policyOf(resolveOwnerDecision(input([], { dataSufficiency: suff("insufficient", ["finance"]) })));
    expect(thin.mode).toBe("EVIDENCE_REQUIRED");
    const ok = policyOf(resolveOwnerDecision(input([])));
    expect(ok.mode).toBe("SUPPORTED");
  });
  it("the card does not claim 'nothing open' without the qualifier", () => {
    const html = renderToStaticMarkup(createElement(OwnerDecisionCard, { decision: resolveOwnerDecision(input([], { staleDomains: ["sales"] })) }));
    expect(html).toContain("owner-decision-empty-policy");
    expect(html).toMatch(/out of date/);
  });
});

describe("13/14. confidence never erases severity or overrides class precedence", () => {
  it("a very low confidence critical danger keeps its severity and is still elected", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "Cash runs out", domain: "cashflow", severity: "critical", confidence: 0.1 })], { dataSufficiency: suff("insufficient", ["cashflow"]) }));
    expect(d.primaryTarget?.severity).toBe("critical");
    expect(policyOf(d).mode).toBe("PROVISIONAL");
    expect(policyOf(d).mode).not.toBe("SUPPORTED");
  });
  it("a 100%-confidence growth item does not outrank a lower-confidence compliance fact", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale", domain: "marketing", confidence: 1, priorityScore: 100, severity: "high" }),
      cand({ findingCode: "COMPLIANCE_BREACH", title: "Licence expired", domain: "compliance", source: "compliance_item", confidence: 0.4, priorityScore: 0, severity: "critical" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Licence expired");
  });
});

describe("plan / forecast claims carry the highest restraint", () => {
  it("a strategy target is never SUPPORTED and never authorizes a commitment on heuristic strength", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "STR_UNAFFORDABLE", title: "Close the funding gap", domain: "strategy", severity: "critical" })], { diagnosedDomains: ["strategy"] }));
    const p = policyOf(d);
    expect(p.claimType).toBe("FORECAST_OR_PLAN");
    expect(p.mode).toBe("CAUTION");
    expect(p.canMakeMaterialCommitment).toBe(false);
    expect(p.reasons.join(" ")).toMatch(/not a forecast/);
  });
});

describe("16. owner surfaces use the one canonical policy", () => {
  it("the control center passes the decision's policy through and states a recorded fact is unaffected", () => {
    const recorded = resolveOwnerDecision(input(
      [cand({ findingCode: "COMPLIANCE_BREACH", title: "Licence expired", domain: "compliance", source: "compliance_item", severity: "critical", priorityScore: 0 })],
      { dataSufficiency: suff("insufficient", ["marketing"]) }
    ));
    const panel = buildOwnerControlCenter({
      dataSufficiencyStatus: "insufficient", lowConfidenceDomains: ["marketing"],
      attention: { total: 0, ownerDecisionsRequired: 0, handledByOpsIQ: 0, criticalUnresolved: 0 } as never,
      blockedRecommendations: 0, proofBlocked: 0, financeBlocked: 0, sopsNeedingReview: 0, trainingRecommendations: 0, equipmentBottlenecks: [],
      processReviewsDue: 0, ownerApprovalsRequired: 0, reassessmentsDue: 0, approvalsAvoided: 0, advicePolicy: recorded.advicePolicy,
    });
    expect(panel.advicePolicy).toEqual(recorded.advicePolicy);
    expect(panel.criticalAlerts.join(" ")).toMatch(/recorded issue below is a fact and is unaffected/);
  });
  it("only the canonical decision resolves the policy; no surface re-derives modes", () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const f = join(dir, n);
        if (statSync(f).isDirectory()) { if (n !== "__tests__" && n !== "node_modules" && n !== "generated") walk(f); }
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) && /resolveOwnerAdvicePolicy\(/.test(readFileSync(f, "utf8"))) callers.push(f.slice(process.cwd().length + 1));
      }
    };
    walk(join(process.cwd(), "src"));
    expect(callers.sort()).toEqual(["src/domain/owner-spine/owner-advice-policy.ts", "src/domain/owner-spine/owner-decision.ts"]);
  });
  it("the card never recomputes a mode: it only renders decision.advicePolicy", () => {
    const src = readFileSync(join(process.cwd(), "src/components/owner/OwnerDecisionCard.tsx"), "utf8");
    expect(src).not.toMatch(/resolveOwnerAdvicePolicy|confidence\.score\s*[<>]/);
  });
});

describe("policy invariants", () => {
  const scenarios: OwnerAdvicePolicy[] = [
    resolveOwnerDecision(input([], { diagnosedDomains: [], dataSufficiency: suff("insufficient") })),
    resolveOwnerDecision(input([sales()], { dataSufficiency: suff("caution") })),
    resolveOwnerDecision(input([sales()], { dataSufficiency: suff("insufficient", ["sales"]) })),
    resolveOwnerDecision(input([cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "x", domain: "cashflow", severity: "critical", stale: true })], { staleDomains: ["cashflow"] })),
    resolveOwnerDecision(input([growth()], { gate: gate({ cash: { gateState: "CRITICAL", basis: "", driver: "cash", conflicting: true } }) })),
    resolveOwnerDecision(input([cand({ findingCode: "COMPLIANCE_BREACH", title: "x", domain: "compliance", source: "compliance_item", severity: "critical" })], { dataSufficiency: suff("insufficient") })),
  ].map((d) => d.advicePolicy);
  it("the vocabulary is closed and small", () => {
    expect(OWNER_ADVICE_MODES).toHaveLength(7);
    expect(OWNER_CLAIM_TYPES).toHaveLength(5);
    for (const p of scenarios) expect(OWNER_ADVICE_MODES).toContain(p.mode);
  });
  it("every non-SUPPORTED mode that is not a clean recorded fact carries a concrete next evidence action (no dead end)", () => {
    for (const p of scenarios) {
      if (p.mode === "SUPPORTED") continue;
      if (p.mode === "RECORDED_FACT" && p.reasons.length === 0) continue;
      expect(p.nextEvidenceAction.length, p.mode).toBeGreaterThan(10);
    }
  });
  it("no owner-facing policy text states a probability, a chance or an unestablished 'safe'", () => {
    for (const p of scenarios) {
      const text = [p.ownerStatement, p.nextEvidenceAction, ...p.reasons].join(" ");
      expect(text).not.toMatch(/\d\s*%|probab|chance|likely|safe to act|is safe/i);
    }
  });
  it("is deterministic", () => {
    const i = input([sales()], { dataSufficiency: suff("caution") });
    expect(resolveOwnerDecision(i).advicePolicy).toEqual(resolveOwnerDecision(i).advicePolicy);
  });
  it("direct resolver: a missing target never fabricates an act", () => {
    const p = resolveOwnerAdvicePolicy({
      state: "NO_EVIDENCE", primary: null, intent: null, primaryDomainLabel: "", dataSufficiency: { status: "insufficient", lowConfidenceDomains: [], missingCriticalData: [] },
      staleDomains: [], gateCashProvisional: false, gateCashConflicting: false, missingInformation: [], reassessmentTrigger: "later",
    });
    expect(p.canAct).toBe(false);
    expect(p.claimType).toBeNull();
  });
});

describe("17/18. PR #582 score contracts and PR #583 threshold provenance remain intact; frozen values unchanged", () => {
  it("score registry names", () => {
    expect(SCORE_SEMANTICS_NAMES).toContain("confidence");
    expect(SCORE_SEMANTICS_NAMES).toContain("priorityScore");
  });
  it("sufficiency cutoffs, danger bands and the registry are unchanged", () => {
    expect(DATA_CONFIDENCE_CAUTION).toBe(70);
    expect(DATA_CONFIDENCE_INSUFFICIENT).toBe(40);
    expect([dangerLevel(19), dangerLevel(20), dangerLevel(59), dangerLevel(60), dangerLevel(79), dangerLevel(80)]).toEqual(["none", "low", "elevated", "high", "high", "critical"]);
    expect(THRESHOLD_REGISTRY.length).toBe(210);
  });
  it("the decision-confidence bands and caps in owner-decision.ts are unchanged", () => {
    const src = readFileSync(join(process.cwd(), "src/domain/owner-spine/owner-decision.ts"), "utf8");
    expect(src).toMatch(/if \(score > 40\) \{ score = 40; capped = true; \}/);
    expect(src).toMatch(/if \(score > 70\) \{ score = 70; capped = true; \}/);
    expect(src).toMatch(/const REFRESH_CONFIDENCE_CAP = 0\.4;/);
  });
});
