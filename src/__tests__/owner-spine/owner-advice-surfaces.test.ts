/**
 * Single-source advice semantics across owner surfaces. Only the canonical advice policy (owner-advice-policy.ts) may state
 * whether OpsIQ supports committing money, capacity or a plan. Other surfaces may DESCRIBE evidence quality, report workflow
 * status or enforce safety gates, but must never assert owner-wide action permission from a confidence value.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { buildPriorityCommandStrip } from "@/domain/owner-mode/command-center-priorities";
import { PriorityCommandStrip } from "@/components/owner/PriorityCommandStrip";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import { buildOwnerControlCenter } from "@/domain/owner-mode/owner-control-center";
import { classifyOwnerFindingCode, resolveOwnerDecision, type OwnerDecisionCandidate, type ResolveOwnerDecisionInput } from "@/domain/owner-spine/owner-decision";
import { ownerMaterialCommitmentGuard } from "@/domain/owner-spine/owner-advice-policy";
import { evaluateOwnerActionGate, NO_OWNER_GATE_CONSTRAINTS, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const BIZ = "biz-1";
const WS = "ws-1";
const NOW = new Date("2026-09-27T12:00:00Z");

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string; domain: OwnerDecisionCandidate["domain"] }): OwnerDecisionCandidate {
  const sourceId = p.sourceId ?? `${p.findingCode}-${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    candidateId: p.candidateId ?? `${p.source ?? "domain_action"}:${sourceId}`, businessId: BIZ, workspaceId: WS, source: p.source ?? "domain_action", domain: p.domain, sourceId,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: null, title: p.title, explanation: "",
    severity: p.severity === undefined ? "high" : p.severity, priorityScore: p.priorityScore ?? 60, expectedImpactScore: 50, confidence: p.confidence ?? 0.9, effortScore: 40,
    status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: p.missingData ?? [], verificationMetric: null, evidenceAsOf: null,
    stale: p.stale ?? false, exclusion: null, targetRoute: `/owner/${p.domain}`,
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
  status, lowestDataConfidenceScore: status === "sufficient" ? 90 : 20, lowConfidenceDomains: low, missingCriticalData: missing,
});
const gate = (over: Partial<OwnerGateConstraints>): OwnerGateConstraints => ({ ...NO_OWNER_GATE_CONSTRAINTS, ...over });

const HIGH_PLAN = {
  found: true, topPriorityLabel: "Cash timing", dominantConstraint: "cash_timing", nextBestAction: "Chase the three largest receivables", doNotDo: ["Add spend"],
  proofRequired: ["Bank statement"], reassessmentTriggers: ["After the next cash update"], redDomains: ["cash"], ownerOffload: "—", overallConfidence: "high", approvalRequired: false,
};
const strip = () => buildPriorityCommandStrip({ wbp: HIGH_PLAN, readiness: { blockers: ["Costs missing"], overallScore: 40 }, guidance: { nextBestInput: "costs", canProceedWithStrongRecommendation: true } });
const PERMISSION = /safe to act|actions? (?:are|is) paused|go ahead|you can proceed|ok to (?:act|commit)/i;

describe("command-center priority notes describe evidence and never grant permission", () => {
  it("high local confidence is never 'safe to act'; low/blocked is never 'actions are paused'", () => {
    const cards = [
      ...strip(),
      ...buildPriorityCommandStrip({ wbp: { ...HIGH_PLAN, overallConfidence: "low" }, readiness: null, guidance: { nextBestInput: "costs", canProceedWithStrongRecommendation: false } }),
    ];
    for (const c of cards) {
      expect(c.confidenceNote).not.toMatch(PERMISSION);
      expect(c.confidenceNote).toMatch(/^Evidence behind this plan analysis/);
    }
  });
});

describe("canonical policy beside the strip", () => {
  const scenarios: Array<[string, ResolveOwnerDecisionInput]> = [
    ["EVIDENCE_REQUIRED", input([cand({ findingCode: "FIN_MISSING_CRITICAL_DATA", title: "Add your cash and costs", domain: "finance", missingData: ["cashOnHand"], confidence: 1 })], { dataSufficiency: suff("insufficient", ["finance"], ["cashOnHand"]) })],
    ["REFRESH_REQUIRED", input([cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "Cash runs out", domain: "cashflow", severity: "critical", stale: true, confidence: 0.95 })], { staleDomains: ["cashflow"] })],
    ["PROVISIONAL", input([cand({ findingCode: "SALES_LOW_CONVERSION", title: "Raise conversion", domain: "sales" })], { dataSufficiency: suff("insufficient", ["sales"]) })],
    ["CAUTION", input([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing" })], { dataSufficiency: suff("insufficient", ["finance"]) })],
  ];
  for (const [mode, inp] of scenarios) {
    it(`${mode} + high local confidence: no surface says 'safe to act' and the strip states there is no commitment approval`, () => {
      const d = resolveOwnerDecision(inp);
      expect(d.advicePolicy.mode).toBe(mode);
      expect(d.advicePolicy.canMakeMaterialCommitment).toBe(false);
      const html = renderToStaticMarkup(
        createElement("div", null, createElement(OwnerDecisionCard, { decision: d }), createElement(PriorityCommandStrip, { cards: strip(), advicePolicy: d.advicePolicy }))
      );
      expect(html).not.toMatch(/safe to act/i);
      expect(html).toContain("priority-strip-no-commitment");
      expect(html).toMatch(/not approval to commit money, capacity or a plan/);
    });
  }
  it("a supported decision adds no no-commitment line (the strip stays purely descriptive)", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "SALES_LOW_CONVERSION", title: "Raise conversion", domain: "sales" })]));
    expect(d.advicePolicy.canMakeMaterialCommitment).toBe(true);
    const html = renderToStaticMarkup(createElement(PriorityCommandStrip, { cards: strip(), advicePolicy: d.advicePolicy }));
    expect(html).not.toContain("priority-strip-no-commitment");
    expect(html).not.toMatch(/safe to act/i);
  });
});

describe("Control Center: material-commitment wording comes only from the canonical policy", () => {
  const panel = (over: Partial<Parameters<typeof buildOwnerControlCenter>[0]>) => buildOwnerControlCenter({
    dataSufficiencyStatus: "sufficient", lowConfidenceDomains: [], attention: { total: 0, ownerDecisionsRequired: 0, handledByOpsIQ: 0, criticalUnresolved: 0 } as never,
    blockedRecommendations: 0, proofBlocked: 0, financeBlocked: 0, sopsNeedingReview: 0, trainingRecommendations: 0, equipmentBottlenecks: [], processReviewsDue: 0,
    ownerApprovalsRequired: 0, reassessmentsDue: 0, approvalsAvoided: 0, ...over,
  });
  it("RECORDED_FACT + unrelated insufficient data: the recorded issue is not contradicted by a global prohibition", () => {
    const d = resolveOwnerDecision(input(
      [cand({ findingCode: "COMPLIANCE_BREACH", title: "Licence expired", domain: "compliance", source: "compliance_item", severity: "critical", priorityScore: 0 })],
      { dataSufficiency: suff("insufficient", ["marketing"], ["cashOnHand"]) }
    ));
    const cc = panel({
      dataSufficiencyStatus: "insufficient", lowConfidenceDomains: ["marketing"], advicePolicy: d.advicePolicy,
      mainTarget: { title: "Licence expired", priorityClass: "SAFETY_COMPLIANCE", source: "compliance_item", findingCode: "COMPLIANCE_BREACH" },
    });
    expect(cc.whatNotToDo).toEqual([]);
    expect(cc.conditions.join(" ")).toMatch(/Go ahead with "Licence expired"; hold other material decisions that depend on the missing data/);
    expect(cc.criticalAlerts.join(" ")).toMatch(/recorded issue below is a fact and is unaffected/);
  });
  it("a policy that supports a commitment produces no prohibition even when sufficiency is only cautionary", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "SALES_LOW_CONVERSION", title: "Raise conversion", domain: "sales" })]));
    const cc = panel({ dataSufficiencyStatus: "caution", advicePolicy: d.advicePolicy });
    expect(cc.whatNotToDo).toEqual([]);
  });
  it("CAUTION growth/plan: the canonical policy withholds a commitment and the panel says so (not sufficiency)", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing" })], { dataSufficiency: suff("insufficient", ["finance"]) }));
    const cc = panel({ dataSufficiencyStatus: "insufficient", advicePolicy: d.advicePolicy });
    expect(cc.whatNotToDo.join(" ")).toMatch(/Do not commit money, capacity or a plan on this evidence/);
  });
  it("sufficiency alone never creates a prohibition when the canonical policy permits a commitment", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "SALES_LOW_CONVERSION", title: "Raise conversion", domain: "sales" })]));
    const cc = panel({ dataSufficiencyStatus: "insufficient", lowConfidenceDomains: ["finance"], advicePolicy: d.advicePolicy });
    expect(cc.criticalAlerts.join(" ")).toMatch(/Data is insufficient/); // disclosure
    expect(cc.whatNotToDo).toEqual([]); // no separate permission rule
  });
  it("every non-permitting mode maps to a guard and permitting modes to none", () => {
    for (const [mode, inp] of [
      ["EVIDENCE_REQUIRED", input([], { diagnosedDomains: [], dataSufficiency: suff("insufficient") })],
      ["REFRESH_REQUIRED", input([cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "x", domain: "cashflow", severity: "critical", stale: true })], { staleDomains: ["cashflow"] })],
      ["SUPPORTED", input([cand({ findingCode: "SALES_LOW_CONVERSION", title: "x", domain: "sales" })])],
    ] as const) {
      const g = ownerMaterialCommitmentGuard(resolveOwnerDecision(inp).advicePolicy);
      expect(g === null, mode).toBe(mode === "SUPPORTED");
    }
  });
});

describe("Now View guidance labels are scoped to guidance, not owner permission", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(authenticated)/owner/now/page.tsx"), "utf8");
  it("every classification label says 'Guidance' or 'Requires', never a bare 'Ready' / 'Blocked'", () => {
    const block = src.slice(src.indexOf("const CLASSIFICATION_LABEL"), src.indexOf("};", src.indexOf("const CLASSIFICATION_LABEL")));
    const labels = [...block.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThanOrEqual(9);
    for (const l of labels) expect(l, l).toMatch(/^(Guidance|Requires)/);
    expect(src).toContain('data-testid="now-guidance-scope"');
    expect(src).toMatch(/does not support a commitment on the current evidence/);
  });
  it("the guidance classification module states it never overrides the canonical policy", () => {
    expect(readFileSync(join(process.cwd(), "src/domain/owner-guidance/guidance-classification.ts"), "utf8")).toMatch(/never overrides `advicePolicy\.canMakeMaterialCommitment`/);
  });
});

describe("stale margin evidence is never worded as a current measurement (hold unchanged)", () => {
  const subject = { domain: "sales", intent: "EXECUTE" as const, findingCode: "SALES_OPP_WINBACK" };
  const base = gate({ grossMarginPct: 5 });
  it("current margin keeps the present-tense wording", () => {
    const v = evaluateOwnerActionGate(base, subject);
    expect(v.allowed).toBe(false);
    expect(v.blocks?.[0].reason ?? "").toMatch(/^Gross margin is 5%/);
  });
  it("out-of-date margin: still blocked with the same code, but worded as the last recorded figure", () => {
    const v = evaluateOwnerActionGate(gate({ grossMarginPct: 5, grossMarginOutOfDate: true }), subject);
    expect(v.allowed).toBe(false);
    expect(v.blocks?.map((b) => b.code)).toEqual(evaluateOwnerActionGate(base, subject).blocks?.map((b) => b.code));
    const reason = v.blocks![0].reason;
    expect(reason).toMatch(/last recorded gross margin \(from out-of-date figures\)/);
    expect(reason).not.toMatch(/^Gross margin is/);
  });
  it("the owner decision target title and explanation distinguish last-known from current, and keep the hold", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale", domain: "marketing" })], { gate: gate({ grossMarginPct: 5, grossMarginConfidence: 0.4, grossMarginOutOfDate: true }) }));
    expect(d.primaryTarget?.findingCode).toBe("GATE_MARGIN_BELOW_FLOOR");
    expect(d.primaryTarget?.title).toMatch(/last figures are out of date/);
    expect(d.primaryTarget?.explanation).toMatch(/out-of-date figures/);
    expect(d.primaryTarget?.explanation).not.toMatch(/^Gross margin is/);
    const fresh = resolveOwnerDecision(input([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale", domain: "marketing" })], { gate: gate({ grossMarginPct: 5, grossMarginConfidence: 0.9 }) }));
    expect(fresh.primaryTarget?.title).toBe("Restore gross margin above the safety floor before scaling sales or marketing");
  });
});

function sources(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) { if (n !== "__tests__" && n !== "node_modules" && n !== "generated") sources(f, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(f);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("governance: no surface outside the canonical policy asserts owner-wide action permission from confidence", () => {
  const files = sources(join(process.cwd(), "src")).map((f) => ({ path: f.slice(process.cwd().length + 1), code: stripComments(readFileSync(f, "utf8")) }));
  const POLICY = "src/domain/owner-spine/owner-advice-policy.ts";
  it("no 'safe to act' / 'actions are paused' permission wording in owner-facing code", () => {
    const offenders = files.filter((f) => /safe to act|strong (?:actions|recommendations) (?:are )?paused/i.test(f.code)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
  it("the owner-wide 'Do not make material decisions' statement exists only in the canonical policy", () => {
    const offenders = files.filter((f) => f.path !== POLICY && /Do not make material decisions/.test(f.code)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
  it("no owner-facing module maps a confidence value to an owner-wide go/no-go phrase", () => {
    const risky = /(?:confidence|Confidence)[^\n;{}]{0,60}(?:===|==|>=|<=|>|<)[^\n;{}]{0,40}\?\s*["'`][^"'`\n]*\b(?:safe|go ahead|proceed|paused|do not act)\b/;
    const offenders = files.filter((f) => f.path !== POLICY && risky.test(f.code)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
  it("the strip and the Now page never recompute policy; only the canonical decision resolves it", () => {
    for (const p of ["src/components/owner/PriorityCommandStrip.tsx", "src/domain/owner-mode/command-center-priorities.ts", "src/app/(authenticated)/owner/now/page.tsx"]) {
      expect(files.find((f) => f.path === p)!.code, p).not.toMatch(/resolveOwnerAdvicePolicy\(|sufficiencyOnlyAdvicePolicy\(/);
    }
  });
});
